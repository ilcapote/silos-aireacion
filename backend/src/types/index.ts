export interface User {
  id: number;
  username: string;
  password: string;
  role: 'super_admin' | 'user';
  require_password_change: number;
  created_at: string;
  updated_at: string;
}

export interface Silo {
  id: number;
  name: string;
  establishment_id: number;
  aerator_position: number;
  min_temperature: number;
  max_temperature: number;
  min_humidity: number;
  max_humidity: number;
  peak_hours_shutdown: number;
  air_start_hour: number;
  air_end_hour: number;
  use_sun_schedule: number;
  manual_mode: 'auto' | 'on' | 'off';
  modified: number;
  created_at: string;
  updated_at: string;
}

export interface AerationLog {
  id: number;
  silo_name: string;
  temperature: number;
  humidity: number;
  aeration_status: string;
  timestamp: string;
}

export interface Establishment {
  id: number;
  name: string;
  owner: string;
  latitude: number;
  longitude: number;
  city?: string;
  max_operating_current?: number;
  current_sensor_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Board {
  id: number;
  mac_address: string;
  establishment_id: number;
  registration_date: string;
  firmware_version?: string;
  last_heartbeat?: string;
  status: 'online' | 'offline' | 'warning';
  created_at: string;
  updated_at: string;
}

export interface JWTPayload {
  userId: number;
  username: string;
  role: string;
}

export interface TemperatureSensor {
  id: number;
  serial_number: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface SensorBar {
  id: number;
  name: string;
  establishment_id?: number;
  silo_id?: number;
  sensor1_id?: number;
  sensor2_id?: number;
  sensor3_id?: number;
  sensor4_id?: number;
  sensor5_id?: number;
  sensor6_id?: number;
  sensor7_id?: number;
  sensor8_id?: number;
  created_at: string;
  updated_at: string;
}

export interface TemperatureReading {
  id: number;
  sensor_id: number;
  bar_id?: number;
  silo_id?: number;
  temperature: number;
  timestamp: string;
  raw_payload?: string;
}

export interface SensorBarWithDetails extends SensorBar {
  sensors: Array<{
    position: number;
    sensor?: TemperatureSensor;
  }>;
  silo_name?: string;
  establishment_name?: string;
}
