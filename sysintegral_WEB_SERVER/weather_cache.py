from datetime import datetime, timedelta
import threading
import time
from typing import Dict, Optional
import requests
import pytz

class WeatherCache:
    def __init__(self, max_establishments: int = 20):
        self.max_establishments = max_establishments
        self.cache: Dict[int, Dict] = {}  # establishment_id -> weather_data
        self.last_update: Dict[int, datetime] = {}  # establishment_id -> last_update_time
        self.current_index = 0
        self.establishments = []
        self.lock = threading.Lock()
        self._stop_thread = False
        self.update_thread = threading.Thread(target=self._update_loop, daemon=True)
        self.openweather_api_key = "9257c21ba8315b973232a13f875e43e3"  # API Key de OpenWeatherMap
        
    def start(self, establishments):
        """Inicia el ciclo de actualización con la lista de establecimientos"""
        if len(establishments) > self.max_establishments:
            raise ValueError(f"Número de establecimientos ({len(establishments)}) excede el máximo permitido ({self.max_establishments})")
        
        self.establishments = establishments
        self.update_thread.start()
        
    def stop(self):
        """Detiene el ciclo de actualización"""
        self._stop_thread = True
        self.update_thread.join()
        
    def get_weather_data(self, establishment_id: int) -> Optional[Dict]:
        """Obtiene los datos del clima para un establecimiento específico"""
        with self.lock:
            return self.cache.get(establishment_id)

    def _fetch_openweather_current_data(self, lat, lon):
        if not self.openweather_api_key:
            print("OpenWeatherMap API key not set in WeatherCache. Skipping OWM data fetch.")
            return None
        
        owm_url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={self.openweather_api_key}&units=metric"
        try:
            response = requests.get(owm_url, timeout=10)
            response.raise_for_status()
            data = response.json()

            temp = data.get("main", {}).get("temp")
            humidity = data.get("main", {}).get("humidity")
            
            rain_1h = data.get("rain", {}).get("1h", 0)
            snow_1h = data.get("snow", {}).get("1h", 0)
            precipitation_amount = float(rain_1h) + float(snow_1h)

            if temp is not None and humidity is not None:
                return {
                    'temperature': float(temp),
                    'humidity': float(humidity),
                    'precipitation_amount': precipitation_amount
                }
            else:
                print(f"OpenWeatherMap: Missing temperature or humidity in response for lat:{lat}, lon:{lon}. Data: {data}")
                return None
        except requests.exceptions.HTTPError as http_err:
            if http_err.response.status_code == 401:
                print(f"OpenWeatherMap API request failed with 401 Unauthorized for lat:{lat}, lon:{lon}. Check your OPENWEATHER_API_KEY.")
            else:
                print(f"OpenWeatherMap API request failed with HTTPError: {http_err} for lat:{lat}, lon:{lon}")
            return None
        except requests.RequestException as e:
            print(f"Error fetching OpenWeatherMap data for lat:{lat}, lon:{lon}: {e}")
            return None
        except Exception as e:
            print(f"Error processing OpenWeatherMap data for lat:{lat}, lon:{lon}: {e}")
            return None

    def _fetch_weather_data(self, establishment):
        """
        Obtiene datos meteorológicos para un establecimiento usando la API de MET Norway
        y los combina con datos actuales de OpenWeatherMap, asegurando que la hora actual esté representada.
        """
        utc_tz = pytz.utc
        argentina_tz = pytz.timezone('America/Argentina/Buenos_Aires')

        # 1. Fetch MET Norway data
        raw_met_data_points = []
        try:
            base_url_met = "https://api.met.no/weatherapi/locationforecast/2.0/complete"
            headers_met = {'User-Agent': 'sysintegral/1.0 (sysintegralelectro@gmail.com)'}
            params_met = {'lat': establishment.latitude, 'lon': establishment.longitude}
            
            response_met = requests.get(base_url_met, params=params_met, headers=headers_met, timeout=10)
            response_met.raise_for_status()
            data_met = response_met.json()
            timeseries_met = data_met.get('properties', {}).get('timeseries', [])
            
            for entry in timeseries_met:
                entry_time_utc = datetime.fromisoformat(entry['time'].replace('Z', '+00:00')).astimezone(utc_tz)
                instant_details = entry.get('data', {}).get('instant', {}).get('details', {})
                next_1_hour_data = entry.get('data', {}).get('next_1_hours', {})
                next_1_hour_details = next_1_hour_data.get('details', {})
                next_1_hour_summary = next_1_hour_data.get('summary', {})
                
                temp = instant_details.get('air_temperature')
                humidity = instant_details.get('relative_humidity')
                symbol_code = next_1_hour_summary.get('symbol_code', '')
                
                if temp is not None and humidity is not None:
                    raw_met_data_points.append({
                        'hour_utc_dt': entry_time_utc,
                        'temperature': float(temp),
                        'humidity': float(humidity),
                        'precipitation_amount': float(next_1_hour_details.get('precipitation_amount', 0)),
                        'probability_of_precipitation': float(next_1_hour_summary.get('probability_of_precipitation', 0)),
                        'symbol_code': symbol_code
                    })
        except requests.RequestException as e:
            print(f"Error al obtener datos de MET Norway para {establishment.name}: {str(e)}")
        except Exception as e:
            print(f"Error procesando datos de MET Norway para {establishment.name}: {str(e)}")

        # 2. Fetch OWM data
        current_owm_data = self._fetch_openweather_current_data(establishment.latitude, establishment.longitude)

        # 3. Determine current target UTC hour (rounded down)
            # Para determinar la hora UTC actual redondeada que corresponde al inicio de la hora local actual:
        current_utc_time = datetime.now(utc_tz) # Hora UTC actual, ej: 18:55:57 UTC
        current_argentina_time_ref = current_utc_time.astimezone(argentina_tz) # Convertida a local, ej: 15:55:57 GMT-3
        
        # Redondear la hora local al inicio de la hora
        rounded_argentina_time_local = current_argentina_time_ref.replace(minute=0, second=0, microsecond=0) # ej: 15:00:00 GMT-3
        
        # Convertir esta hora local redondeada de nuevo a UTC para usarla como referencia para el filtrado de datos de MET Norway y OWM
        current_target_hour_utc = rounded_argentina_time_local.astimezone(utc_tz) # ej: 18:00:00 UTC
        
        print(f"[WeatherCache DBG] current_utc_time: {current_utc_time}, current_argentina_time_ref: {current_argentina_time_ref}, rounded_argentina_time_local: {rounded_argentina_time_local}, derived current_target_hour_utc: {current_target_hour_utc}")

        # 4. Create a dictionary for all potential forecast hours for easy lookup and update
        forecast_dict_utc = {dp['hour_utc_dt']: dp for dp in raw_met_data_points}

        # 5. Integrate OWM data
        if current_owm_data:
            owm_temp = current_owm_data['temperature']
            owm_humidity = current_owm_data['humidity']
            owm_precip_amount = current_owm_data['precipitation_amount']

            if current_target_hour_utc in forecast_dict_utc:
                met_hour_data = forecast_dict_utc[current_target_hour_utc]
                combined_temp = (met_hour_data['temperature'] + owm_temp) / 2
                combined_humidity = (met_hour_data['humidity'] + owm_humidity) / 2
                
                met_precip_amount = met_hour_data['precipitation_amount']
                met_prob_precip = met_hour_data['probability_of_precipitation']
                combined_precip_amount = 0.0
                if met_precip_amount > 0 or owm_precip_amount > 0:
                    combined_precip_amount = max(met_precip_amount, owm_precip_amount)
                elif met_prob_precip > 0:
                    combined_precip_amount = 0.01 
                
                met_hour_data['temperature'] = round(combined_temp, 2)
                met_hour_data['humidity'] = round(combined_humidity, 1)
                met_hour_data['precipitation_amount'] = round(combined_precip_amount, 2)
                # probability_of_precipitation remains MET's original value for this hour
                print(f"Combined MET+OWM for {establishment.name} at {current_target_hour_utc} UTC")
            else:
                forecast_dict_utc[current_target_hour_utc] = {
                    'hour_utc_dt': current_target_hour_utc,
                    'temperature': float(owm_temp),
                    'humidity': float(owm_humidity),
                    'precipitation_amount': float(owm_precip_amount),
                    'probability_of_precipitation': 0.0, # OWM doesn't provide probability
                    'symbol_code': ''  # OWM doesn't provide symbol_code
                }
                print(f"Added OWM-only data for {establishment.name} at {current_target_hour_utc} UTC (MET data missing for this hour)")

        # 6. Convert to sorted list, filter from current hour, format for output, limit to 48h
        sorted_utc_hours = sorted(forecast_dict_utc.keys())

        final_weather_data = []
        for hour_utc in sorted_utc_hours:
            if hour_utc >= current_target_hour_utc: # Start from current hour or future
                if len(final_weather_data) < 24: # Limit to 24 entries
                    data_point = forecast_dict_utc[hour_utc]
                    local_time_str = hour_utc.astimezone(argentina_tz).strftime('%Y-%m-%d %H:00')
                    final_weather_data.append({
                        'hour': local_time_str,
                        'temperature': data_point['temperature'],
                        'humidity': data_point['humidity'],
                        'precipitation_amount': data_point['precipitation_amount'],
                        'probability_of_precipitation': data_point['probability_of_precipitation'],
                        'symbol_code': data_point.get('symbol_code', '')
                    })
                else:
                    break # Reached 24 entries limit
        
        if not final_weather_data:
            # This can happen if MET fails, OWM fails, or OWM provides data for an hour MET also missed, but that hour is in the past relative to current_target_hour_utc (unlikely with new logic)
            print(f"No weather data could be compiled for {establishment.name} after processing.")
            return None

        return final_weather_data
            
    def _update_loop(self):
        """Ciclo principal que actualiza los pronósticos cada minuto"""
        while not self._stop_thread:
            if not self.establishments:
                time.sleep(60)
                continue
                
            establishment = self.establishments[self.current_index]
            
            try:
                weather_data = self._fetch_weather_data(establishment)
                if weather_data:
                    with self.lock:
                        self.cache[establishment.id] = weather_data
                        self.last_update[establishment.id] = datetime.now()
            except Exception as e:
                print(f"Error actualizando pronóstico para establecimiento {establishment.id}: {str(e)}")
                
            # Avanzar al siguiente establecimiento
            self.current_index = (self.current_index + 1) % len(self.establishments)
            
            # Esperar 2 minutos antes de la siguiente actualización
            time.sleep(120)