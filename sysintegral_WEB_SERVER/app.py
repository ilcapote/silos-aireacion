from datetime import datetime, timedelta
import pytz
from sqlalchemy import func, or_, desc
from flask import Flask, render_template, request, redirect, url_for, flash, session, abort, jsonify, get_flashed_messages, current_app
from sqlalchemy.exc import IntegrityError
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import requests
from weather_cache import WeatherCache
import os
from dotenv import load_dotenv
import json


def format_datetime(dt, format='%Y-%m-%d %H:%M:%S'):
    """Formatea un objeto datetime a string"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
    return dt.strftime(format)

def get_argentina_time():
    """
    Obtiene la hora actual de Argentina de forma explícita
    """
    utc_now = datetime.utcnow()
    utc_tz = pytz.UTC
    utc_time = utc_tz.localize(utc_now)
    argentina_tz = pytz.timezone('America/Argentina/Buenos_Aires')
    argentina_time = utc_time.astimezone(argentina_tz)
    
    # Log para debug
    app.logger.info(f"DEBUG get_argentina_time - UTC: {utc_time}, Argentina: {argentina_time}")
    
    return argentina_time

def get_slot_name(minute):
    """
    Determina el nombre del slot basado en el minuto
    """
    if minute <= 20:
        return "0-20"
    elif minute <= 40:
        return "21-40"
    else:
        return "41-59"


# Cargar variables de entorno
load_dotenv()

# Debug: Imprimir variables de entorno
print("Environment variables loaded:")
print(f"DB_TYPE: {os.getenv('DB_TYPE')}")
print(f"LOCAL_MYSQL_USER: {os.getenv('LOCAL_MYSQL_USER')}")
print(f"LOCAL_MYSQL_HOST: {os.getenv('LOCAL_MYSQL_HOST')}")

app = Flask(__name__)
app.jinja_env.add_extension('jinja2.ext.do')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default_secret_key')

# Configuración de la base de datos basada en el entorno
db_type = os.getenv('DB_TYPE')
if not db_type:
    print("Warning: DB_TYPE not found in environment variables, defaulting to 'local'")
    db_type = 'local'
print(f"Using database type: {db_type}")

if db_type == 'local':
    # Usar configuración local
    MYSQL_USER = os.environ.get('LOCAL_MYSQL_USER')
    MYSQL_PASSWORD = os.environ.get('LOCAL_MYSQL_PASSWORD')
    MYSQL_HOST = os.environ.get('LOCAL_MYSQL_HOST')
    MYSQL_DATABASE = os.environ.get('LOCAL_MYSQL_DATABASE')
    print("Using local database configuration:")
else:
    # Usar configuración de PythonAnywhere
    MYSQL_USER = os.environ.get('PA_MYSQL_USER')
    MYSQL_PASSWORD = os.environ.get('PA_MYSQL_PASSWORD')
    MYSQL_HOST = os.environ.get('PA_MYSQL_HOST')
    MYSQL_DATABASE = os.environ.get('PA_MYSQL_DATABASE')
    print("Using PythonAnywhere database configuration:")

print(f"Database URI: mysql+pymysql://{MYSQL_USER}:****@{MYSQL_HOST}/{MYSQL_DATABASE}")

# Configurar la URI de la base de datos
app.config['SQLALCHEMY_DATABASE_URI'] = f'mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}/{MYSQL_DATABASE}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Tablas de equilibrio de humedad para granos.
# Formato: {Temperatura: {Humedad Relativa: Contenido de Humedad de Equilibrio (%)}}
EQUILIBRIUM_TABLES = {
    "trigo": {
        10: {30: 10.1, 35: 10.7, 40: 11.3, 45: 11.9, 50: 12.6, 55: 13.2, 60: 13.9, 65: 14.6, 70: 15.3, 75: 16.2, 80: 17.2, 85: 18.4, 90: 20.0},
        12: {30: 9.9, 35: 10.6, 40: 11.2, 45: 11.8, 50: 12.4, 55: 13.1, 60: 13.7, 65: 14.4, 70: 15.2, 75: 16.1, 80: 17.1, 85: 18.3, 90: 19.9},
        14: {30: 9.8, 35: 10.4, 40: 11.0, 45: 11.7, 50: 12.3, 55: 12.9, 60: 13.6, 65: 14.3, 70: 15.1, 75: 16.0, 80: 17.0, 85: 18.2, 90: 19.8},
        16: {30: 9.7, 35: 10.3, 40: 10.9, 45: 11.5, 50: 12.1, 55: 12.8, 60: 13.5, 65: 14.2, 70: 15.0, 75: 15.8, 80: 16.8, 85: 18.1, 90: 19.7},
        18: {30: 9.5, 35: 10.1, 40: 10.8, 45: 11.4, 50: 12.0, 55: 12.7, 60: 13.3, 65: 14.1, 70: 14.8, 75: 15.7, 80: 16.7, 85: 18.0, 90: 19.6},
        20: {30: 9.4, 35: 10.0, 40: 10.6, 45: 11.3, 50: 11.9, 55: 12.5, 60: 13.2, 65: 13.9, 70: 14.7, 75: 15.6, 80: 16.6, 85: 17.8, 90: 19.5},
        22: {30: 9.3, 35: 9.9, 40: 10.5, 45: 11.1, 50: 11.8, 55: 12.4, 60: 13.1, 65: 13.8, 70: 14.6, 75: 15.5, 80: 16.5, 85: 17.7, 90: 19.4},
        24: {30: 9.1, 35: 9.8, 40: 10.4, 45: 11.0, 50: 11.6, 55: 12.3, 60: 13.0, 65: 13.7, 70: 14.5, 75: 15.4, 80: 16.4, 85: 17.6, 90: 19.3},
        26: {30: 9.0, 35: 9.6, 40: 10.3, 45: 10.9, 50: 11.5, 55: 12.2, 60: 12.9, 65: 13.6, 70: 14.4, 75: 15.3, 80: 16.3, 85: 17.5, 90: 19.2},
        28: {30: 8.9, 35: 9.5, 40: 10.2, 45: 10.8, 50: 11.4, 55: 12.1, 60: 12.8, 65: 13.5, 70: 14.3, 75: 15.2, 80: 16.2, 85: 17.4, 90: 19.1},
        30: {30: 8.8, 35: 9.4, 40: 10.0, 45: 10.7, 50: 11.3, 55: 12.0, 60: 12.6, 65: 13.4, 70: 14.2, 75: 15.1, 80: 16.1, 85: 17.3, 90: 19.0},
        32: {30: 8.6, 35: 9.3, 40: 9.9, 45: 10.6, 50: 11.2, 55: 11.9, 60: 12.5, 65: 13.3, 70: 14.1, 75: 15.0, 80: 16.0, 85: 17.2, 90: 18.9}
    },
    "soja": {
        10: {30: 6.1, 35: 7.0, 40: 7.8, 45: 8.6, 50: 9.5, 55: 10.3, 60: 11.2, 65: 12.2, 70: 13.2, 75: 14.4, 80: 15.7, 85: 17.3, 90: 19.4},
        12: {30: 6.0, 35: 6.9, 40: 7.7, 45: 8.5, 50: 9.4, 55: 10.2, 60: 11.1, 65: 12.1, 70: 13.1, 75: 14.3, 80: 15.6, 85: 17.2, 90: 19.3},
        14: {30: 5.9, 35: 6.7, 40: 7.6, 45: 8.4, 50: 9.3, 55: 10.1, 60: 11.0, 65: 12.0, 70: 13.0, 75: 14.2, 80: 15.5, 85: 17.1, 90: 19.2},
        16: {30: 5.8, 35: 6.6, 40: 7.5, 45: 8.3, 50: 9.2, 55: 10.0, 60: 10.9, 65: 11.9, 70: 12.9, 75: 14.1, 80: 15.4, 85: 17.0, 90: 19.1},
        18: {30: 5.7, 35: 6.5, 40: 7.4, 45: 8.2, 50: 9.1, 55: 9.9, 60: 10.8, 65: 11.8, 70: 12.8, 75: 14.0, 80: 15.3, 85: 16.9, 90: 19.0},
        20: {30: 5.6, 35: 6.4, 40: 7.3, 45: 8.1, 50: 9.0, 55: 9.8, 60: 10.7, 65: 11.7, 70: 12.8, 75: 13.9, 80: 15.2, 85: 16.9, 90: 19.0},
        22: {30: 5.4, 35: 6.3, 40: 7.2, 45: 8.0, 50: 8.9, 55: 9.7, 60: 10.7, 65: 11.6, 70: 12.7, 75: 13.8, 80: 15.2, 85: 16.8, 90: 18.9},
        24: {30: 5.3, 35: 6.2, 40: 7.1, 45: 7.9, 50: 8.8, 55: 9.6, 60: 10.6, 65: 11.5, 70: 12.6, 75: 13.7, 80: 15.1, 85: 16.7, 90: 18.8},
        26: {30: 5.2, 35: 6.1, 40: 7.0, 45: 7.8, 50: 8.7, 55: 9.6, 60: 10.5, 65: 11.4, 70: 12.5, 75: 13.7, 80: 15.0, 85: 16.6, 90: 18.7},
        28: {30: 5.1, 35: 6.0, 40: 6.9, 45: 7.7, 50: 8.6, 55: 9.5, 60: 10.4, 65: 11.3, 70: 12.4, 75: 13.6, 80: 14.9, 85: 16.5, 90: 18.6},
        30: {30: 5.0, 35: 5.9, 40: 6.8, 45: 7.6, 50: 8.5, 55: 9.4, 60: 10.3, 65: 11.3, 70: 12.3, 75: 13.5, 80: 14.8, 85: 16.5, 90: 18.6},
        32: {30: 4.9, 35: 5.8, 40: 6.7, 45: 7.5, 50: 8.4, 55: 9.3, 60: 10.2, 65: 11.2, 70: 12.2, 75: 13.4, 80: 14.8, 85: 16.4, 90: 18.5}
    },
    "maiz": {
        10: {30: 9.9, 35: 10.6, 40: 11.2, 45: 11.8, 50: 12.5, 55: 13.1, 60: 13.8, 65: 14.6, 70: 15.4, 75: 16.3, 80: 17.3, 85: 18.6, 90: 20.3},
        12: {30: 9.7, 35: 10.3, 40: 11.0, 45: 11.6, 50: 12.3, 55: 12.9, 60: 13.6, 65: 14.4, 70: 15.2, 75: 16.1, 80: 17.1, 85: 18.4, 90: 20.0},
        14: {30: 9.4, 35: 10.1, 40: 10.7, 45: 11.4, 50: 12.0, 55: 12.7, 60: 13.4, 65: 14.2, 70: 15.0, 75: 15.9, 80: 16.9, 85: 18.2, 90: 19.9},
        16: {30: 9.2, 35: 9.9, 40: 10.5, 45: 11.2, 50: 11.8, 55: 12.5, 60: 13.2, 65: 14.0, 70: 14.8, 75: 15.7, 80: 16.7, 85: 18.0, 90: 19.7},
        18: {30: 9.0, 35: 9.7, 40: 10.3, 45: 11.0, 50: 11.6, 55: 12.3, 60: 13.0, 65: 13.8, 70: 14.6, 75: 15.5, 80: 16.6, 85: 17.9, 90: 19.5},
        20: {30: 8.8, 35: 9.5, 40: 10.1, 45: 10.8, 50: 11.5, 55: 12.1, 60: 12.8, 65: 13.6, 70: 14.4, 75: 15.3, 80: 16.4, 85: 17.7, 90: 19.4},
        22: {30: 8.6, 35: 9.3, 40: 10.0, 45: 10.6, 50: 11.3, 55: 12.0, 60: 12.7, 65: 13.4, 70: 14.3, 75: 15.2, 80: 16.2, 85: 17.5, 90: 19.2},
        24: {30: 8.5, 35: 9.1, 40: 9.8, 45: 10.4, 50: 11.1, 55: 11.8, 60: 12.5, 65: 13.3, 70: 14.1, 75: 15.0, 80: 16.1, 85: 17.4, 90: 19.1},
        26: {30: 8.3, 35: 8.9, 40: 9.6, 45: 10.3, 50: 10.9, 55: 11.6, 60: 12.3, 65: 13.1, 70: 13.9, 75: 14.9, 80: 15.9, 85: 17.2, 90: 19.0},
        28: {30: 8.1, 35: 8.8, 40: 9.4, 45: 10.1, 50: 10.8, 55: 11.5, 60: 12.2, 65: 12.9, 70: 13.8, 75: 14.7, 80: 15.8, 85: 17.1, 90: 18.8},
        30: {30: 7.9, 35: 8.6, 40: 9.3, 45: 9.9, 50: 10.6, 55: 11.3, 60: 12.0, 65: 12.8, 70: 13.6, 75: 14.6, 80: 15.6, 85: 17.0, 90: 18.7},
        32: {30: 7.8, 35: 8.4, 40: 9.1, 45: 9.8, 50: 10.5, 55: 11.1, 60: 11.9, 65: 12.6, 70: 13.5, 75: 14.4, 80: 15.5, 85: 16.8, 90: 18.6}
    }
}

login_manager = LoginManager()
login_manager.login_view = 'login'
login_manager.init_app(app)

# Decorador para restringir acceso a super_admin
def super_admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'super_admin':
            flash('Acceso no autorizado. Se requiere rol de Super Administrador.', 'danger')
            return redirect(url_for('login')) # O a una página de 'no autorizado'
        return f(*args, **kwargs)
    return decorated_function

# Crear instancia global del caché de pronósticos
weather_cache = WeatherCache(max_establishments=20)

# Tabla de relación muchos a muchos entre usuarios y establecimientos
user_establishments = db.Table('user_establishments',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('establishment_id', db.Integer, db.ForeignKey('establishment.id'), primary_key=True)
)

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    establishments = db.relationship('Establishment', secondary=user_establishments, 
                                   lazy='subquery', backref=db.backref('users', lazy=True))
    created_users = db.relationship('User', backref=db.backref('created_by', remote_side=[id]))

    def set_password(self, password):
        # Forzar el uso de pbkdf2:sha256
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        try:
            # Intenta verificar con werkzeug
            return check_password_hash(self.password_hash, password)
        except Exception as e:
            # Si falla, registra el error y devuelve False
            print(f"Error al verificar contraseña: {e}")
            return False

    def can_access_establishment(self, establishment_id):
        if self.role == 'super_admin':
            return True
        return any(e.id == establishment_id for e in self.establishments)

class Establishment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    owner = db.Column(db.String(100), nullable=False)
    # Nuevos campos para la corriente máxima y el sensor
    max_operating_current = db.Column(db.Float, nullable=True) 
    current_sensor_id = db.Column(db.String(80), nullable=True) # ID del sensor de corriente
    silos = db.relationship('Silo', backref='establishment', lazy=True, cascade='all, delete-orphan')

class Silo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    establishment_id = db.Column(db.Integer, db.ForeignKey('establishment.id'), nullable=False)
    min_temperature = db.Column(db.Float, nullable=False)
    max_temperature = db.Column(db.Float, nullable=False)
    min_humidity = db.Column(db.Float, nullable=False)
    max_humidity = db.Column(db.Float, nullable=False)
    peak_hours_shutdown = db.Column(db.Boolean, default=False)
    air_start_hour = db.Column(db.Integer, default=22)  # Hora de inicio de aireación (0-23)
    air_end_hour = db.Column(db.Integer, default=6)    # Hora de fin de aireación (0-23)
    use_sun_schedule = db.Column(db.Boolean, default=False)  # Usar horario basado en horas de sol
    aerator_position = db.Column(db.Integer, nullable=False)  # Posición del aireador (1-8)
    modified = db.Column(db.Boolean, default=False)
    manual_mode = db.Column(db.String(10), default='auto')  # 'auto', 'on', 'off'
    __table_args__ = (db.UniqueConstraint('establishment_id', 'aerator_position', name='unique_aerator_position'),)

class SiloChangeLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    silo_id = db.Column(db.Integer, db.ForeignKey('silo.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    field_changed = db.Column(db.String(50), nullable=False)
    old_value = db.Column(db.String(100), nullable=False)
    new_value = db.Column(db.String(100), nullable=False)
    
    silo = db.relationship('Silo', backref=db.backref('change_logs', lazy=True))
    user = db.relationship('User', backref=db.backref('silo_changes', lazy=True))

class Board(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mac_address = db.Column(db.String(17), unique=True, nullable=False)  # Format: XX:XX:XX:XX:XX:XX
    registration_date = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    establishment_id = db.Column(db.Integer, db.ForeignKey('establishment.id'), nullable=False)
    establishment = db.relationship('Establishment', backref=db.backref('boards', lazy=True))

class DeviceHeartbeat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mac_address = db.Column(db.String(17), db.ForeignKey('board.mac_address'), nullable=False)
    last_heartbeat = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    status = db.Column(db.String(20), nullable=False, default='offline')  # online, offline, warning
    firmware_version = db.Column(db.String(10), nullable=True)  # Versión del firmware
    board = db.relationship('Board', backref=db.backref('heartbeat', uselist=False))

class Esp32Reboot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mac_address = db.Column(db.String(17), db.ForeignKey('board.mac_address'), nullable=False)
    reboot_time = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    reason = db.Column(db.String(100), nullable=True)  # Razón del reinicio (si se proporciona)
    board = db.relationship('Board', backref=db.backref('reboots', lazy=True))

class AeratorRuntime(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    silo_id = db.Column(db.Integer, db.ForeignKey('silo.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    runtime_hours = db.Column(db.Float, nullable=False)  # Duración en horas
    silo = db.relationship('Silo', backref=db.backref('runtimes', lazy=True))

class ProtectionAlert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    silo_id = db.Column(db.Integer, db.ForeignKey('silo.id'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.now)
    active = db.Column(db.Boolean, default=True)
    
    silo = db.relationship('Silo', backref=db.backref('protection_alerts', lazy=True))

class DeviceActionLog(db.Model):
    """Registro de acciones/intentos de los ESP32 (encender/apagar aireadores)"""
    id = db.Column(db.Integer, primary_key=True)
    mac_address = db.Column(db.String(17), db.ForeignKey('board.mac_address'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    action = db.Column(db.String(10), nullable=False)  # 'ON', 'OFF'
    position = db.Column(db.Integer, nullable=False)  # Posición del aireador (1-8)
    result = db.Column(db.String(20), nullable=False)  # 'success', 'error'
    message = db.Column(db.String(255), nullable=True)  # Mensaje adicional (opcional)
    
    board = db.relationship('Board', backref=db.backref('action_logs', lazy=True))

class DeviceHeartbeatHistory(db.Model):
    """Historial de heartbeats cada 20 minutos, retenido por 7 días"""
    id = db.Column(db.Integer, primary_key=True)
    mac_address = db.Column(db.String(17), db.ForeignKey('board.mac_address'), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    
    board = db.relationship('Board', backref=db.backref('heartbeat_history', lazy=True))

class GlobalAeratorControl(db.Model):
    """Control global de aireadores - permite al super_admin desactivar todos los aireadores"""
    id = db.Column(db.Integer, primary_key=True)
    enabled = db.Column(db.Boolean, default=True, nullable=False)  # True = aireadores pueden funcionar, False = todos desactivados
    last_modified = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    modified_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    
    modified_by = db.relationship('User', backref=db.backref('global_aerator_modifications', lazy=True))


class LecturaTemperatura(db.Model):
    __tablename__ = 'lectura_temperatura'
    id = db.Column(db.Integer, primary_key=True)
    sensor_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id'), nullable=False)
    barra_id = db.Column(db.Integer, db.ForeignKey('barra_sensores.id'), nullable=True)
    silo_id = db.Column(db.Integer, db.ForeignKey('silo.id'), nullable=True)
    temperatura = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    raw_payload = db.Column(db.Text, nullable=True)

    sensor = db.relationship('SensorTemperatura', backref=db.backref('lecturas', lazy=True))
    barra = db.relationship('BarraSensores', backref=db.backref('lecturas', lazy=True))
    silo = db.relationship('Silo', backref=db.backref('lecturas', lazy=True))

    def __repr__(self):
        return f'<LecturaTemperatura sensor_id={self.sensor_id} temp={self.temperatura} t={self.timestamp}>'

class SensorTemperatura(db.Model):
    __tablename__ = 'sensor_temperatura'
    id = db.Column(db.Integer, primary_key=True)
    numero_serie = db.Column(db.String(255), unique=True, nullable=False)
    descripcion = db.Column(db.String(100), nullable=True)

    def __repr__(self):
        return f'<SensorTemperatura {self.numero_serie}>'

class BarraSensores(db.Model):
    __tablename__ = 'barra_sensores'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False, unique=True)
    # establecimiento_id ahora es nullable. Se asignará cuando la barra se vincule a un silo.
    establecimiento_id = db.Column(db.Integer, db.ForeignKey('establishment.id'), nullable=True)

    # Sensores asignados a esta barra (un sensor solo puede estar en una posición de una barra)
    sensor1_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor1_st_id'), unique=True, nullable=True)
    sensor2_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor2_st_id'), unique=True, nullable=True)
    sensor3_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor3_st_id'), unique=True, nullable=True)
    sensor4_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor4_st_id'), unique=True, nullable=True)
    sensor5_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor5_st_id'), unique=True, nullable=True)
    sensor6_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor6_st_id'), unique=True, nullable=True)
    sensor7_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor7_st_id'), unique=True, nullable=True)
    sensor8_id = db.Column(db.Integer, db.ForeignKey('sensor_temperatura.id', name='fk_bs_sensor8_st_id'), unique=True, nullable=True)

    # Silo al que esta barra está asignada (una barra solo puede estar en un silo)
    silo_asignado_id = db.Column(db.Integer, db.ForeignKey('silo.id', name='fk_bs_silo_asignado_s_id'), unique=True, nullable=True)

    establecimiento = db.relationship('Establishment', backref=db.backref('barras_sensores', lazy='dynamic'))
    
    sensor1 = db.relationship('SensorTemperatura', foreign_keys=[sensor1_id], post_update=True, lazy='joined')
    sensor2 = db.relationship('SensorTemperatura', foreign_keys=[sensor2_id], post_update=True, lazy='joined')
    sensor3 = db.relationship('SensorTemperatura', foreign_keys=[sensor3_id], post_update=True, lazy='joined')
    sensor4 = db.relationship('SensorTemperatura', foreign_keys=[sensor4_id], post_update=True, lazy='joined')
    sensor5 = db.relationship('SensorTemperatura', foreign_keys=[sensor5_id], post_update=True, lazy='joined')
    sensor6 = db.relationship('SensorTemperatura', foreign_keys=[sensor6_id], post_update=True, lazy='joined')
    sensor7 = db.relationship('SensorTemperatura', foreign_keys=[sensor7_id], post_update=True, lazy='joined')
    sensor8 = db.relationship('SensorTemperatura', foreign_keys=[sensor8_id], post_update=True, lazy='joined')

    silo_asignado = db.relationship('Silo', 
                                   foreign_keys=[silo_asignado_id], 
                                   backref=db.backref('barra_sensores_asociada', uselist=False, lazy='joined'))

    def __repr__(self):
        return f'<BarraSensores {self.nombre}>'

    def get_ordered_sensors_with_data(self):
        sensors_data = []
        for i in range(1, 9):
            sensor_obj = getattr(self, f'sensor{i}')
            sensor_id = getattr(self, f'sensor{i}_id')
            if sensor_obj:
                sensors_data.append({
                    'position': i, 
                    'sensor_id': sensor_id,
                    'serial_number': sensor_obj.numero_serie,
                    'description': sensor_obj.descripcion
                })
            else:
                sensors_data.append({
                    'position': i, 
                    'sensor_id': None,
                    'serial_number': None,
                    'description': None
                })
        return sensors_data

    def get_assigned_sensor_ids(self):
        ids = []
        for i in range(1, 9):
            sensor_id = getattr(self, f'sensor{i}_id')
            if sensor_id:
                ids.append(sensor_id)
        return ids

class EggData(db.Model):
    """Modelo para almacenar datos de producción de huevos de granjas"""
    __tablename__ = 'egg_data'
    id = db.Column(db.Integer, primary_key=True)
    granja_id = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    galpon_1 = db.Column(db.Integer, nullable=False)
    galpon_2 = db.Column(db.Integer, nullable=False)
    galpon_3 = db.Column(db.Integer, nullable=False)
    galpon_4 = db.Column(db.Integer, nullable=False)
    total = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))

    def __repr__(self):
        return f'<EggData granja_id={self.granja_id} total={self.total} timestamp={self.timestamp}>'


class MortalityData(db.Model):
    """Modelo para almacenar datos de mortalidad de granjas"""
    __tablename__ = 'mortality_data'
    id = db.Column(db.Integer, primary_key=True)
    granja_id = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
    galpon_1 = db.Column(db.Integer, nullable=False)
    galpon_2 = db.Column(db.Integer, nullable=False)
    galpon_3 = db.Column(db.Integer, nullable=False)
    galpon_4 = db.Column(db.Integer, nullable=False)
    total = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))

    def __repr__(self):
        return f'<MortalityData granja_id={self.granja_id} total={self.total} timestamp={self.timestamp}>'

def standardize_mac(mac):
    """Estandariza el formato de la dirección MAC"""
    return mac.upper()

@login_manager.user_loader
def load_user(user_id):
    # Usar db.session.get() en lugar de query.get()
    return db.session.get(User, int(user_id))

def init_db():
    """Inicializa la base de datos y el caché de pronósticos"""
    with app.app_context():
        db.create_all()
        
        # Crear super_admin si no existe
        if not User.query.filter_by(role='super_admin').first():
            super_admin = User(
                username='super_admin',
                role='super_admin'
            )
            super_admin.set_password('admin123')
            db.session.add(super_admin)
            db.session.commit()
            print('Super administrador creado exitosamente')
            
        # Iniciar el caché de pronósticos con todos los establecimientos
        establishments = Establishment.query.all()
        weather_cache.start(establishments)

def log_silo_change(silo_id, user_id, field, old_value, new_value):
    """
    Registra un cambio en un silo en el log.
    """
    log_entry = SiloChangeLog(
        silo_id=silo_id,
        user_id=user_id,
        field_changed=field,
        old_value=str(old_value),
        new_value=str(new_value)
    )
    db.session.add(log_entry)
    db.session.commit()

def get_weather_data(establishment):
    """
    Obtiene datos meteorológicos para un establecimiento usando la API de MET Norway.
    Retorna datos de temperatura, humedad y probabilidad de precipitación para la hora actual y las próximas 23 horas.
    """
    return weather_cache.get_weather_data(establishment.id) or weather_cache._fetch_weather_data(establishment)

# Cache para horas de sol (evitar llamadas excesivas a la API)
sun_hours_cache = {}

def get_sun_hours(latitude, longitude, date=None):
    """
    Obtiene las horas de amanecer y atardecer para una ubicación específica.
    
    Args:
        latitude: Latitud del establecimiento
        longitude: Longitud del establecimiento  
        date: Fecha para calcular (default: hoy)
        
    Returns:
        dict: {'sunrise_hour': int, 'sunset_hour': int} o None si falla
    """
    if date is None:
        date = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')).date()
    
    # Crear clave de cache
    cache_key = f"{latitude}_{longitude}_{date}"
    
    # Verificar cache (válido por 1 día)
    if cache_key in sun_hours_cache:
        cached_data, cached_time = sun_hours_cache[cache_key]
        if datetime.now() - cached_time < timedelta(hours=12):  # Cache válido por 12 horas
            return cached_data
    
    try:
        # Llamar a la API de sunrise-sunset.org
        url = "https://api.sunrise-sunset.org/json"
        params = {
            'lat': latitude,
            'lng': longitude,
            'date': date.strftime('%Y-%m-%d'),
            'formatted': 0  # Obtener en formato UTC
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data['status'] == 'OK':
            # Convertir a hora local de Argentina
            tz_argentina = pytz.timezone('America/Argentina/Buenos_Aires')
            
            sunrise_utc = datetime.fromisoformat(data['results']['sunrise'].replace('Z', '+00:00'))
            sunset_utc = datetime.fromisoformat(data['results']['sunset'].replace('Z', '+00:00'))
            
            sunrise_local = sunrise_utc.astimezone(tz_argentina)
            sunset_local = sunset_utc.astimezone(tz_argentina)
            
            # Aplicar offset de 1 hora: +1 hora después del amanecer, -1 hora antes del atardecer
            # Esto asegura que los paneles solares tengan suficiente energía
            sunrise_with_offset = sunrise_local + timedelta(hours=1)
            sunset_with_offset = sunset_local - timedelta(hours=1)
            
            result = {
                'sunrise_hour': sunrise_with_offset.hour,
                'sunset_hour': sunset_with_offset.hour,
                'original_sunrise': sunrise_local.hour,
                'original_sunset': sunset_local.hour
            }
            
            # Guardar en cache
            sun_hours_cache[cache_key] = (result, datetime.now())
            
            app.logger.info(f"Horas de sol obtenidas para {latitude},{longitude}: amanecer {result['sunrise_hour']}h, atardecer {result['sunset_hour']}h")
            return result
            
    except Exception as e:
        app.logger.error(f"Error obteniendo horas de sol: {str(e)}")
    
    # Fallback: horario 9-17hs (ya incluye el offset de 1 hora)
    # Horario original sería 8-18hs, pero con offset queda 9-17hs
    app.logger.warning(f"Usando horario de sol por defecto 9-17hs (con offset) para {latitude},{longitude}")
    return {
        'sunrise_hour': 9,
        'sunset_hour': 17,
        'original_sunrise': 8,
        'original_sunset': 18
    }

def is_cloudy_weather(weather_data):
    """
    Determina si el clima está nublado basado en los datos meteorológicos.
    
    Args:
        weather_data: Diccionario con datos del clima de una hora específica
        
    Returns:
        bool: True si está nublado (parcial o totalmente)
    """
    if not weather_data:
        return False
    
    # Obtener el símbolo del clima si está disponible
    symbol_code = weather_data.get('symbol_code', '')
    
    # Códigos que indican nubosidad (basado en MET Norway)
    cloudy_codes = [
        'cloudy', 'partlycloudy_day', 'partlycloudy_night',
        'fog', 'heavyrain', 'lightrain', 'rain',
        'heavysnow', 'lightsnow', 'snow',
        'sleet', 'heavysleet', 'lightsleet'
    ]
    
    # Verificar si el código indica nubosidad
    for code in cloudy_codes:
        if code in symbol_code.lower():
            return True
    
    # También verificar por probabilidad de precipitación alta
    precipitation_prob = weather_data.get('precipitation_probability', 0)
    if precipitation_prob > 30:  # Si hay más de 30% de probabilidad de lluvia, considerarlo nublado
        return True
    
    return False


def has_fog_or_mist(weather_data):
    """
    Detecta si hay niebla, neblina o condiciones de baja visibilidad.
    
    Args:
        weather_data: Diccionario con datos del clima de una hora específica
        
    Returns:
        bool: True si hay niebla/neblina
    """
    if not weather_data:
        return False
    
    symbol_code = weather_data.get('symbol_code', '')
    
    # Códigos de MET Norway que indican niebla/neblina
    fog_codes = ['fog', 'mist']
    
    for code in fog_codes:
        if code in symbol_code.lower():
            return True
    
    # Detectar por humedad muy alta (>95%) + temperatura baja
    # Esto puede indicar niebla incluso si el symbol_code no lo reporta
    humidity = weather_data.get('humidity', 0)
    temperature = weather_data.get('temperature', 100)
    
    if humidity > 95 and temperature < 15:
        return True
    
    return False


def get_available_positions(establishment_id, current_silo_id=None):
    """
    Obtiene las posiciones disponibles para un establecimiento dado.
    Si se proporciona current_silo_id, excluye la posición actual del silo de la lista de posiciones ocupadas.
    """
    # Obtener todas las posiciones ocupadas en el establecimiento
    occupied_positions = db.session.query(Silo.aerator_position).filter(
        Silo.establishment_id == establishment_id
    )
    
    # Si estamos editando un silo, excluir su posición actual
    if current_silo_id is not None:
        occupied_positions = occupied_positions.filter(Silo.id != current_silo_id)
    
    occupied_positions = [p[0] for p in occupied_positions.all()]
    
    # Generar lista de posiciones disponibles (1-8)
    available_positions = [i for i in range(1, 9) if i not in occupied_positions]
    return available_positions

def get_user_establishments():
    """
    Obtiene los establecimientos a los que tiene acceso el usuario según su rol.
    """
    if current_user.role == 'super_admin':
        return Establishment.query.all()
    else:
        return current_user.establishments

def get_silos_operation_status(establishment, base_time):
    """
    Procesa todos los silos de un establecimiento para las próximas 24 horas.
    
    Args:
        establishment: Objeto Establishment
        base_time: Hora base en formato 'YYYY-MM-DD HH:00'
        
    Returns:
        Lista de diccionarios con el estado de cada silo para cada hora
    """
    # Obtener datos meteorológicos una sola vez para el establecimiento
    weather_data = get_weather_data(establishment)
    if not weather_data:
        return []
    
    # Identificar índices de lluvia y ampliar una hora antes y después
    rain_hours_idx = set()
    for idx, hour_data in enumerate(weather_data):
        if hour_data['precipitation_amount'] > 0:
            rain_hours_idx.add(idx)
            if idx > 0:
                rain_hours_idx.add(idx - 1)
            if idx < len(weather_data) - 1:
                rain_hours_idx.add(idx + 1)

    current_time = datetime.strptime(base_time, '%Y-%m-%d %H:00')
    silos_status = []
    
    # Procesar cada silo
    for silo in establishment.silos:
        silo_manual_mode = silo.manual_mode

        # Procesar para la hora actual
        hour_str = current_time.strftime('%Y-%m-%d %H:00')

        # Encontrar el índice y los datos de la hora actual en el pronóstico
        current_hour_index = -1
        current_weather = None
        for i, hour_data in enumerate(weather_data):
            if hour_data['hour'] == hour_str:
                current_hour_index = i
                current_weather = hour_data
                break

        # Determinar si hay lluvia en la ventana de seguridad
        no_rain_in_window = current_hour_index not in rain_hours_idx

        current_should_operate = False  # Valor por defecto
        current_mode_str = ""

        if silo_manual_mode == 'on':
            current_should_operate = True
            if not no_rain_in_window:  # Lluvia anula el encendido manual
                current_should_operate = False
            current_mode_str = 'manual'
        
        elif silo_manual_mode == 'off':
            current_should_operate = False
            current_mode_str = 'manual'

        elif silo_manual_mode == 'auto':
            current_mode_str = 'auto'
            if current_weather:  # Solo operar si hay datos meteorológicos
                temp_ok = silo.min_temperature <= current_weather['temperature'] <= silo.max_temperature
                humidity_ok = silo.min_humidity <= current_weather['humidity'] <= silo.max_humidity
                hour = current_time.hour
                peak_hours = 17 <= hour <= 23
                peak_hours_ok = not (silo.peak_hours_shutdown and peak_hours)

                air_time_ok = True
                if silo.use_sun_schedule:
                    sun_hours = get_sun_hours(silo.establishment.latitude, silo.establishment.longitude)
                    sunrise_hour = sun_hours['sunrise_hour']
                    sunset_hour = sun_hours['sunset_hour']

                    if sunrise_hour <= sunset_hour:
                        sun_time_ok = sunrise_hour <= hour < sunset_hour
                    else:
                        sun_time_ok = hour >= sunrise_hour or hour < sunset_hour

                    cloudy_weather = is_cloudy_weather(current_weather)
                    air_time_ok = sun_time_ok and not cloudy_weather
                else:
                    air_start_hour = silo.air_start_hour
                    air_end_hour = silo.air_end_hour
                    air_time_ok = False
                    if air_start_hour == 0 and air_end_hour == 23:
                        air_time_ok = True
                    else:
                        if air_start_hour < air_end_hour:
                            air_time_ok = air_start_hour <= hour < air_end_hour
                        else:  # Caso nocturno (ej. 22:00 a 06:00)
                            air_time_ok = hour >= air_start_hour or hour < air_end_hour

                if temp_ok and humidity_ok and no_rain_in_window and peak_hours_ok and air_time_ok:
                    current_should_operate = True
            # Si no hay current_weather, current_should_operate permanece False

        else:  # Por defecto, o si silo_manual_mode es 'intelligent' u otro valor no manejado explícitamente
            current_mode_str = 'intelligent'
            # La lógica para 'intelligent' es actualmente la misma que 'auto'
            if current_weather:  # Solo operar si hay datos meteorológicos
                temp_ok = silo.min_temperature <= current_weather['temperature'] <= silo.max_temperature
                humidity_ok = silo.min_humidity <= current_weather['humidity'] <= silo.max_humidity
                hour = current_time.hour
                peak_hours = 17 <= hour <= 23
                peak_hours_ok = not (silo.peak_hours_shutdown and peak_hours)

                air_start_hour = silo.air_start_hour
                air_end_hour = silo.air_end_hour
                air_time_ok = False
                if air_start_hour == 0 and air_end_hour == 23:
                    air_time_ok = True
                else:
                    if air_start_hour < air_end_hour:
                        air_time_ok = air_start_hour <= hour < air_end_hour
                    else:  # Caso nocturno
                        air_time_ok = hour >= air_start_hour or hour < air_end_hour
                
                if temp_ok and humidity_ok and no_rain_in_window and peak_hours_ok and air_time_ok:
                    current_should_operate = True
            # Si no hay current_weather, current_should_operate permanece False

        silos_status.append({
            'silo_id': silo.id,
            'hour': hour_str,
            'should_operate': current_should_operate,
            'silo': silo,
            'mode': current_mode_str,
            'device_status_info': get_device_status_for_establishment(silo.establishment)
        })

    return silos_status

def check_device_status(last_heartbeat):
    """
    Determina el estado de un dispositivo basado en su último heartbeat
    """
    if not last_heartbeat:
        return 'offline'
        
    now = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires'))
    
    # Asegurarse de que last_heartbeat tenga zona horaria
    if last_heartbeat.tzinfo is None:
        last_heartbeat = last_heartbeat.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
    
    time_diff = now - last_heartbeat
    
    if time_diff > timedelta(minutes=5):
        return 'offline'
    elif time_diff > timedelta(minutes=2):
        return 'warning'
    return 'online'

def get_device_status(mac_address):
    """
    Obtiene el estado actual de un dispositivo
    """
    try:
        heartbeat = DeviceHeartbeat.query.filter_by(mac_address=mac_address).first()
        if not heartbeat:
            return 'offline'
        return check_device_status(heartbeat.last_heartbeat)
    except Exception as e:
        print(f"Error obteniendo estado del dispositivo: {str(e)}")
        return 'offline'

@app.route('/')
def index():
    if current_user.is_authenticated:
        if current_user.role == 'user':
            return redirect(url_for('user_silo_settings'))
        return render_template('index.html')
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        # Búsqueda insensible a mayúsculas/minúsculas
        user = User.query.filter(func.lower(User.username) == func.lower(username)).first()
        
        print(f"Login attempt for user: {username}")
        print(f"User found in database: {user is not None}")
        
        if user:
            password_check = user.check_password(password)
            print(f"Password check result: {password_check}")
            
            if password_check:
                login_user(user)
                flash(f'Bienvenido, {user.username}!', 'success')
                # Redirigir según el rol del usuario
                if user.role == 'user':
                    return redirect(url_for('user_silo_settings'))
                return redirect(url_for('index'))
            else:
                # Mostrar solo parte del hash por seguridad
                print(f"Password hash in DB: {user.password_hash[:20]}...")
        
        flash('Usuario o contraseña incorrectos', 'danger')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Has cerrado sesión exitosamente', 'success')
    return redirect(url_for('login'))

@app.route('/create_admin', methods=['GET', 'POST'])
@login_required
def create_admin():
    if current_user.role != 'super_admin':
        flash('Solo el super administrador puede crear administradores')
        return redirect(url_for('index'))
    
    establishments = Establishment.query.all()
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if User.query.filter_by(username=username).first():
            flash('El nombre de usuario ya existe')
            return render_template('create_admin.html', establishments=establishments)
        
        admin = User(
            username=username,
            role='admin',
            created_by_id=current_user.id
        )
        admin.set_password(password)
        
        # Obtener los establecimientos seleccionados
        selected_establishments = request.form.getlist('establishments')
        for est_id in selected_establishments:
            establishment = Establishment.query.get(int(est_id))
            if establishment:
                admin.establishments.append(establishment)
        
        db.session.add(admin)
        db.session.commit()
        flash('Administrador creado exitosamente')
        return redirect(url_for('index'))
    
    return render_template('create_admin.html', establishments=establishments)

@app.route('/create_user', methods=['GET', 'POST'])
@login_required
def create_user():
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para crear usuarios')
        return redirect(url_for('index'))
    
    # Si es admin, solo mostrar los establecimientos asignados a él
    if current_user.role == 'admin':
        available_establishments = current_user.establishments
    else:
        available_establishments = Establishment.query.all()
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if User.query.filter_by(username=username).first():
            flash('El nombre de usuario ya existe')
            return render_template('create_user.html', establishments=available_establishments)
        
        user = User(
            username=username,
            role='user',
            created_by_id=current_user.id
        )
        user.set_password(password)
        
        # Obtener los establecimientos seleccionados
        selected_establishments = request.form.getlist('establishments')
        for est_id in selected_establishments:
            establishment = Establishment.query.get(int(est_id))
            # Verificar que el admin tenga acceso al establecimiento
            if establishment and (current_user.role == 'super_admin' or 
                                establishment in current_user.establishments):
                user.establishments.append(establishment)
        
        db.session.add(user)
        db.session.commit()
        flash('Usuario creado exitosamente')
        return redirect(url_for('index'))
    
    return render_template('create_user.html', establishments=available_establishments)

@app.route('/create_establishment', methods=['GET', 'POST'])
@login_required
def create_establishment():
    if current_user.role != 'super_admin':
        flash('Solo el super administrador puede crear establecimientos')
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        name = request.form.get('name')
        latitude = request.form.get('latitude')
        longitude = request.form.get('longitude')
        owner = request.form.get('owner')

        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except ValueError:
            flash('Las coordenadas deben ser números válidos')
            return render_template('create_establishment.html')

        if not all([name, latitude, longitude, owner]):
            flash('Todos los campos son requeridos')
            return render_template('create_establishment.html')

        new_establishment = Establishment(
            name=name,
            latitude=latitude,
            longitude=longitude,
            owner=owner
        )
        db.session.add(new_establishment)
        db.session.commit()
        flash('Establecimiento creado exitosamente')
        return redirect(url_for('index'))

    return render_template('create_establishment.html')

@app.route('/manage_users')
@login_required
def manage_users():
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para gestionar usuarios', 'error')
        return redirect(url_for('index'))
    
    if current_user.role == 'super_admin':
        users = User.query.filter(User.id != current_user.id).all()
    else:
        # Para admin, mostrar solo los usuarios que ha creado
        users = User.query.filter_by(created_by_id=current_user.id).all()
    
    establishments = get_user_establishments()
    return render_template('manage_users.html', users=users, establishments=establishments)

@app.route('/edit_user/<int:user_id>', methods=['GET', 'POST'])
@login_required
def edit_user(user_id):
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para editar usuarios', 'error')
        return redirect(url_for('index'))
    
    user = User.query.get_or_404(user_id)
    
    # Verificar que el admin solo pueda editar usuarios que él creó
    if current_user.role == 'admin' and user.created_by_id != current_user.id:
        flash('No tienes permiso para editar este usuario', 'error')
        return redirect(url_for('manage_users'))
    
    if request.method == 'POST':
        if current_user.role not in ['admin', 'super_admin']:
            flash('No tienes permiso para editar silos.', 'danger')
            return redirect(url_for('manage_silos'))
            
        username = request.form.get('username')
        password = request.form.get('password')
        role = request.form.get('role')
        establishment_ids = request.form.getlist('establishments')
        
        # Validaciones básicas
        if not username:
            flash('El nombre de usuario es requerido', 'error')
            return redirect(url_for('edit_user', user_id=user_id))
        
        # Verificar si el nombre de usuario ya existe
        existing_user = User.query.filter(User.username == username, User.id != user_id).first()
        if existing_user:
            flash('El nombre de usuario ya existe', 'error')
            return redirect(url_for('edit_user', user_id=user_id))
        
        try:
            user.username = username
            if password:
                user.set_password(password)
            
            # Solo el super_admin puede cambiar roles
            if current_user.role == 'super_admin':
                if role:  # Solo actualizar el rol si se proporciona uno nuevo
                    user.role = role
            
            # Actualizar establecimientos
            if current_user.role == 'super_admin':
                # Super admin puede asignar cualquier establecimiento
                establishments = Establishment.query.filter(Establishment.id.in_(establishment_ids)).all()
            else:
                # Admin solo puede asignar establecimientos a los que tiene acceso
                accessible_establishments = set(current_user.establishments)
                establishments = [e for e in Establishment.query.filter(Establishment.id.in_(establishment_ids)).all()
                                if e in accessible_establishments]
            
            user.establishments = establishments
            db.session.commit()
            flash('Usuario actualizado exitosamente', 'success')
            return redirect(url_for('manage_users'))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Error al actualizar el usuario: {str(e)}', 'error')
    
    # Para el formulario GET
    establishments = get_user_establishments()
    return render_template('edit_user.html', user=user, establishments=establishments)

@app.route('/delete_user/<int:user_id>', methods=['POST'])
@login_required
def delete_user(user_id):
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para eliminar usuarios', 'error')
        return redirect(url_for('index'))
    
    user = User.query.get_or_404(user_id)
    
    # Verificar que el admin solo pueda eliminar usuarios que él creó
    if current_user.role == 'admin':
        if user.created_by_id != current_user.id:
            flash('No tienes permiso para eliminar este usuario', 'error')
            return redirect(url_for('manage_users'))
        if user.role != 'user':
            flash('No tienes permiso para eliminar usuarios administradores', 'error')
            return redirect(url_for('manage_users'))
    
    try:
        db.session.delete(user)
        db.session.commit()
        flash('Usuario eliminado exitosamente', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar el usuario: {str(e)}', 'error')

    return redirect(url_for('manage_users'))

@app.route('/manage_establishments')
@login_required
def manage_establishments():
    if current_user.role != 'super_admin':
        flash('Solo el super administrador puede gestionar establecimientos')
        return redirect(url_for('index'))
    
    establishments = Establishment.query.all()
    return render_template('manage_establishments.html', establishments=establishments)

@app.route('/edit_establishment/<int:establishment_id>', methods=['GET', 'POST'])
@login_required
def edit_establishment(establishment_id):
    if current_user.role != 'super_admin':
        flash('Solo el super administrador puede editar establecimientos')
        return redirect(url_for('index'))
    
    establishment = Establishment.query.get_or_404(establishment_id)
    
    if request.method == 'POST':
        establishment.name = request.form.get('name')
        establishment.owner = request.form.get('owner')
        # Procesar los nuevos campos
        max_current_str = request.form.get('max_operating_current')
        establishment.current_sensor_id = request.form.get('current_sensor_id')
        
        try:
            establishment.latitude = float(request.form.get('latitude'))
            establishment.longitude = float(request.form.get('longitude'))
            # Convertir la corriente máxima a float, permitiendo vacío
            establishment.max_operating_current = float(max_current_str) if max_current_str else None
        except ValueError:
            flash('Las coordenadas y la corriente máxima deben ser números válidos')
            return render_template('edit_establishment.html', establishment=establishment)
        
        db.session.commit()
        flash('Establecimiento actualizado exitosamente')
        return redirect(url_for('manage_establishments'))
    
    return render_template('edit_establishment.html', establishment=establishment)

@app.route('/delete_establishment/<int:establishment_id>', methods=['POST'])
@login_required
def delete_establishment(establishment_id):
    if current_user.role != 'super_admin':
        flash('Solo el super administrador puede eliminar establecimientos')
        return redirect(url_for('index'))
    
    establishment = Establishment.query.get_or_404(establishment_id)
    
    try:
        # Get all silos for this establishment
        silos = Silo.query.filter_by(establishment_id=establishment_id).all()
        
        # Delete all aerator runtime records for these silos
        for silo in silos:
            AeratorRuntime.query.filter_by(silo_id=silo.id).delete()
            ProtectionAlert.query.filter_by(silo_id=silo.id).delete()
            SiloChangeLog.query.filter_by(silo_id=silo.id).delete()
        
        # Get all boards for this establishment
        boards = Board.query.filter_by(establishment_id=establishment_id).all()
        
        # Delete all related records for these boards
        for board in boards:
            # Delete device heartbeat history records
            DeviceHeartbeatHistory.query.filter_by(mac_address=board.mac_address).delete()
            # Delete device heartbeat records
            DeviceHeartbeat.query.filter_by(mac_address=board.mac_address).delete()
            # Delete ESP32 reboot records
            Esp32Reboot.query.filter_by(mac_address=board.mac_address).delete()
            # Delete device action logs
            DeviceActionLog.query.filter_by(mac_address=board.mac_address).delete()
            # Finally delete the board
            db.session.delete(board)
        
        # Now delete the establishment (which will cascade delete silos)
        db.session.delete(establishment)
        db.session.commit()
        flash('Establecimiento eliminado exitosamente')
    except Exception as e:
        db.session.rollback()
        flash('Error al eliminar el establecimiento: ' + str(e), 'error')
    
    return redirect(url_for('manage_establishments'))

@app.route('/create_silo', methods=['GET', 'POST'])
@login_required
def create_silo():
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para crear silos')
        return redirect(url_for('index'))

    establishments = get_user_establishments()
    
    if request.method == 'POST':
        try:
            name = request.form.get('name')
            establishment_id = int(request.form.get('establishment_id'))
            min_temperature = float(request.form.get('min_temperature'))
            max_temperature = float(request.form.get('max_temperature'))
            min_humidity = float(request.form.get('min_humidity'))
            max_humidity = float(request.form.get('max_humidity'))
            peak_hours_shutdown = 'peak_hours_shutdown' in request.form
            air_start_hour = int(request.form.get('air_start_hour'))
            air_end_hour = int(request.form.get('air_end_hour'))
            aerator_position = int(request.form.get('aerator_position'))

            # Validar rangos
            if min_temperature >= max_temperature:
                flash('La temperatura mínima debe ser menor que la máxima')
                return render_template('create_silo.html', establishments=establishments)
            
            if min_humidity >= max_humidity:
                flash('La humedad mínima debe ser menor que la máxima')
                return render_template('create_silo.html', establishments=establishments)

            # Validar que el usuario tenga acceso al establecimiento
            if not current_user.can_access_establishment(establishment_id):
                flash('No tienes permiso para crear silos en este establecimiento')
                return redirect(url_for('manage_silos'))

            # Validar que la posición esté disponible
            available_positions = get_available_positions(establishment_id)
            if aerator_position not in available_positions:
                flash('La posición seleccionada ya está ocupada por otro silo')
                return render_template('create_silo.html', 
                                     establishments=establishments,
                                     available_positions=available_positions)

            new_silo = Silo(
                name=name,
                establishment_id=establishment_id,
                min_temperature=min_temperature,
                max_temperature=max_temperature,
                min_humidity=min_humidity,
                max_humidity=max_humidity,
                peak_hours_shutdown=peak_hours_shutdown,
                air_start_hour=air_start_hour,
                air_end_hour=air_end_hour,
                aerator_position=aerator_position,
                modified=False
            )

            db.session.add(new_silo)
            db.session.commit()
            flash('Silo creado exitosamente')
            return redirect(url_for('manage_silos'))
            
        except Exception as e:
            db.session.rollback()
            flash(f'Error al crear el silo: {str(e)}')
            return render_template('create_silo.html', establishments=establishments)

    # Para GET request, obtener posiciones disponibles para el primer establecimiento
    first_establishment = establishments[0] if establishments else None
    available_positions = get_available_positions(first_establishment.id) if first_establishment else []
    
    return render_template('create_silo.html', 
                         establishments=establishments,
                         available_positions=available_positions)

@app.route('/edit_silo/<int:silo_id>', methods=['GET', 'POST'])
@login_required
def edit_silo(silo_id):
    silo = Silo.query.get_or_404(silo_id)
    
    if not current_user.can_access_establishment(silo.establishment_id):
        flash('No tienes permiso para editar este silo.', 'danger')
        return redirect(url_for('manage_silos'))
    
    if request.method == 'POST':
        if current_user.role not in ['admin', 'super_admin']:
            flash('No tienes permiso para editar silos.', 'danger')
            return redirect(url_for('manage_silos'))
            
        new_position = int(request.form.get('aerator_position'))
        if new_position != silo.aerator_position:
            # Verificar si la nueva posición está disponible
            available_positions = get_available_positions(silo.establishment_id, silo.id)
            if new_position not in available_positions:
                flash('La posición seleccionada no está disponible.', 'danger')
                return redirect(url_for('edit_silo', silo_id=silo.id))
            
            old_position = silo.aerator_position
            silo.aerator_position = new_position
            silo.modified = True
            log_silo_change(silo.id, current_user.id, 'aerator_position', old_position, new_position)
        
        # Registrar cambios en otros campos
        restrict_air_time = 'restrict_air_time' in request.form
        if restrict_air_time:
            air_start_hour = int(request.form.get('air_start_hour'))
            air_end_hour = int(request.form.get('air_end_hour'))
        else:
            air_start_hour = 0
            air_end_hour = 23
        fields_to_check = {
            'name': request.form.get('name'),
            'min_temperature': float(request.form.get('min_temperature')),
            'max_temperature': float(request.form.get('max_temperature')),
            'min_humidity': float(request.form.get('min_humidity')),
            'max_humidity': float(request.form.get('max_humidity')),
            'peak_hours_shutdown': bool(request.form.get('peak_hours_shutdown')),
            'air_start_hour': air_start_hour,
            'air_end_hour': air_end_hour
        }
        
        for field, new_value in fields_to_check.items():
            old_value = getattr(silo, field)
            if new_value != old_value:
                setattr(silo, field, new_value)
                silo.modified = True
                log_silo_change(silo.id, current_user.id, field, old_value, new_value)
        
        db.session.commit()
        flash('Silo actualizado exitosamente.', 'success')
        return redirect(url_for('manage_silos'))
    
    establishments = get_user_establishments()
    available_positions = get_available_positions(silo.establishment_id, silo.id)
    return render_template('edit_silo.html', silo=silo, establishments=establishments, 
                         available_positions=available_positions)

@app.route('/manage_silos')
@login_required
def manage_silos():
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para gestionar silos', 'error')
        return redirect(url_for('index'))
    
    if current_user.role == 'super_admin':
        silos = Silo.query.all()
    else:
        # Para admin, obtener solo los silos de sus establecimientos
        establishment_ids = [e.id for e in current_user.establishments]
        silos = Silo.query.filter(Silo.establishment_id.in_(establishment_ids)).all()
    
    return render_template('manage_silos.html', silos=silos)

@app.route('/delete_silo/<int:silo_id>', methods=['POST'])
@login_required
def delete_silo(silo_id):
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para eliminar silos', 'error')
        return redirect(url_for('index'))

    silo = Silo.query.get_or_404(silo_id)
    
    # Verificar que el admin tenga acceso al establecimiento del silo
    if current_user.role == 'admin' and not current_user.can_access_establishment(silo.establishment_id):
        flash('No tienes permiso para eliminar este silo', 'error')
        return redirect(url_for('manage_silos'))

    try:
        # Eliminar todos los registros relacionados en todas las tablas
        # 1. Eliminar registros de AeratorRuntime
        AeratorRuntime.query.filter_by(silo_id=silo_id).delete()
        
        # 2. Eliminar registros de ProtectionAlert
        ProtectionAlert.query.filter_by(silo_id=silo_id).delete()
        
        # 3. Eliminar registros de LecturaTemperatura
        LecturaTemperatura.query.filter_by(silo_id=silo_id).delete()
        
        # 4. Eliminar registros de SiloChangeLog
        SiloChangeLog.query.filter_by(silo_id=silo_id).delete()
        
        # 5. Eliminar configuración de aireación
        AerationConfig.query.filter_by(silo_id=silo_id).delete()
        
        # Finalmente eliminar el silo
        db.session.delete(silo)
        db.session.commit()
        flash('Silo eliminado exitosamente', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar el silo: {str(e)}', 'error')

    return redirect(url_for('manage_silos'))

@app.route('/get_silo_weather/<int:silo_id>')
@login_required
def get_silo_weather(silo_id):
    silo = Silo.query.get_or_404(silo_id)
    # Verificar que el usuario tenga acceso al silo
    if current_user.role != 'super_admin':  # super_admin puede acceder a todos los silos
        if not any(silo in establishment.silos for establishment in current_user.establishments):
            return jsonify({'error': 'No tienes permiso para acceder a este silo'}), 403
    
    operation_hours = get_silo_operation_hours(silo_id)
    if operation_hours is None:
        return jsonify({'error': 'No se pudieron obtener los datos meteorológicos'}), 500
        
    return jsonify(operation_hours)

@app.route('/user/silo-settings', methods=['GET', 'POST'])
@login_required
def user_silo_settings():
    selected_silo = None
    silos_status = []  # Lista para almacenar el estado de cada silo
    current_time = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')).strftime('%Y-%m-%d %H:00')

    if request.method == 'POST':
        silo_id = request.form.get('silo_id')
        if not silo_id:
            flash('Por favor seleccione un silo.', 'danger')
            return redirect(url_for('user_silo_settings'))
            
        silo = Silo.query.get_or_404(silo_id)
        if not current_user.can_access_establishment(silo.establishment_id):
            flash('No tienes permiso para modificar este silo.', 'danger')
            return redirect(url_for('user_silo_settings'))
            
        # Registrar cambios en los campos
        restrict_air_time = 'restrict_air_time' in request.form
        schedule_type = request.form.get('schedule_type', 'manual')
        
        if restrict_air_time:
            # Si está activada la restricción, usar el tipo de horario seleccionado
            use_sun_schedule = schedule_type == 'sun'
            if not use_sun_schedule:
                # Horario manual
                air_start_hour = int(request.form.get('air_start_hour'))
                air_end_hour = int(request.form.get('air_end_hour'))
            else:
                # Horario solar - usar valores por defecto que serán ignorados
                air_start_hour = 0
                air_end_hour = 23
        else:
            # Si no está activada la restricción, desactivar horario solar y usar rango completo
            use_sun_schedule = False
            air_start_hour = 0
            air_end_hour = 23
            
        fields_to_check = {
            'min_temperature': float(request.form.get('min_temperature')),
            'max_temperature': float(request.form.get('max_temperature')),
            'min_humidity': float(request.form.get('min_humidity')),
            'max_humidity': float(request.form.get('max_humidity')),
            'peak_hours_shutdown': bool(request.form.get('peak_hours_shutdown', False)),
            'use_sun_schedule': use_sun_schedule,
            'air_start_hour': air_start_hour,
            'air_end_hour': air_end_hour
        }
        
        for field, new_value in fields_to_check.items():
            old_value = getattr(silo, field)
            if new_value != old_value:
                setattr(silo, field, new_value)
                silo.modified = True
                log_silo_change(silo.id, current_user.id, field, old_value, new_value)
        
        db.session.commit()
        flash('Configuración actualizada exitosamente.', 'success')
        return redirect(url_for('user_silo_settings'))
    
    elif request.args.get('silo_id'):
        silo = Silo.query.get_or_404(request.args.get('silo_id'))
        if current_user.role == 'super_admin' or any(silo in establishment.silos for establishment in current_user.establishments):
            selected_silo = silo
    
    # Obtener el filtro de establecimiento (solo para super_admin)
    selected_establishment_id = request.args.get('establishment_id', type=int)
    
    # Obtener establecimientos según el rol del usuario
    if current_user.role == 'super_admin':
        all_establishments = Establishment.query.all()
        # Si hay un filtro, usar solo ese establecimiento
        if selected_establishment_id:
            establishments = [est for est in all_establishments if est.id == selected_establishment_id]
        else:
            establishments = all_establishments
    else:
        all_establishments = current_user.establishments
        establishments = current_user.establishments
    
    # Procesar silos por establecimiento para minimizar llamadas al servicio meteorológico
    for establishment in establishments:
        # Obtener el estado del dispositivo para este establecimiento
        device_info = get_device_status_for_establishment(establishment)
        
        all_operation_statuses = get_silos_operation_status(establishment, current_time)
        # Filtrar solo el estado de la hora actual para la operación del silo
        current_operation_statuses = [op_status for op_status in all_operation_statuses if op_status['hour'] == current_time]
        
        # Añadir la información del estado del dispositivo a cada estado de operación del silo
        for op_status in current_operation_statuses:
            op_status['device_status_info'] = device_info  # Aquí agregamos la info del dispositivo
            silos_status.append(op_status) # Agregamos el estado combinado a la lista final
    
    # Obtener la lista completa de silos para el selector
    if current_user.role == 'super_admin':
        silos = Silo.query.all()
    else:
        silos = []
        for establishment in current_user.establishments:
            silos.extend(establishment.silos)

    # Obtener y limpiar notificaciones de desactivación automática del modo inteligente
    intelligent_mode_notifications = session.pop('intelligent_mode_disabled_notifications', [])
    
    # Mostrar notificaciones como flash messages
    for notification in intelligent_mode_notifications:
        flash(
            f'⚠️ Modo inteligente del silo "{notification["silo_name"]}" fue desactivado automáticamente. '
            f'Motivo: {notification["reason"]}. Se cambió a modo automático.',
            'warning'
        )

    return render_template('user_silo_settings.html', 
                         silos=silos, 
                         selected_silo=selected_silo,
                         silos_status=silos_status,
                         all_establishments=all_establishments,
                         selected_establishment_id=selected_establishment_id)

@app.route('/manage_esp32_devices')
@login_required
def manage_esp32_devices():
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permisos para acceder a esta página', 'danger')
        return redirect(url_for('index'))
    
    devices = Board.query.all() if current_user.role == 'super_admin' else Board.query.join(Establishment).filter(Establishment.id.in_([e.id for e in current_user.establishments])).all()
    establishments = get_user_establishments()
    
    return render_template('manage_esp32_devices.html', devices=devices, establishments=establishments)

@app.route('/esp32_reboots')
@login_required
def esp32_reboots():
    if current_user.role != 'super_admin':
        flash('No tienes permisos para acceder a esta página. Solo disponible para super administradores.', 'danger')
        return redirect(url_for('index'))
    
    # Obtener todos los dispositivos
    devices = Board.query.join(Establishment).all()
    
    # Obtener información de heartbeat para todos los dispositivos
    device_heartbeats = {}
    for device in devices:
        heartbeat = DeviceHeartbeat.query.filter_by(mac_address=device.mac_address).first()
        if heartbeat and heartbeat.last_heartbeat:
            device_heartbeats[device.mac_address] = {
                'last_heartbeat': heartbeat.last_heartbeat,
                'status': heartbeat.status
            }
        else:
            device_heartbeats[device.mac_address] = {
                'last_heartbeat': None,
                'status': 'sin datos'
            }
    
    # Obtener el dispositivo seleccionado (si hay uno)
    selected_device_id = request.args.get('device_id', type=int)
    selected_device = None
    reboots = []
    
    if selected_device_id:
        selected_device = Board.query.get(selected_device_id)
        if selected_device:
            # Obtener los últimos 20 reinicios del dispositivo seleccionado
            reboots = Esp32Reboot.query.filter_by(mac_address=selected_device.mac_address)\
                                    .order_by(Esp32Reboot.reboot_time.desc()).limit(20).all()
    
    return render_template('esp32_reboots.html', devices=devices, selected_device=selected_device, 
                          reboots=reboots, device_heartbeats=device_heartbeats)

@app.route('/register_esp32_device', methods=['POST'])
@login_required
def register_esp32_device():
    if current_user.role != 'super_admin':
        return jsonify({'error': 'Acceso no autorizado'}), 403
    
    mac_address = request.form.get('mac_address')
    establishment_id = request.form.get('establishment_id')
    
    # Validar formato de dirección MAC
    if not mac_address or len(mac_address) != 17 or not all(c in '0123456789ABCDEFabcdef:' for c in mac_address):
        flash('Formato de dirección MAC inválido', 'error')
        return redirect(url_for('manage_esp32_devices'))
    
    # Verificar si la dirección MAC ya existe
    if Board.query.filter_by(mac_address=mac_address.upper()).first():
        flash('Esta dirección MAC ya está registrada', 'error')
        return redirect(url_for('manage_esp32_devices'))
    
    # Verificar si el establecimiento existe
    establishment = Establishment.query.get(establishment_id)
    if not establishment:
        flash('Establecimiento no encontrado', 'error')
        return redirect(url_for('manage_esp32_devices'))
    
    # Crear nuevo dispositivo ESP32
    new_device = Board(
        mac_address=mac_address.upper(),
        registration_date=datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')),
        establishment_id=establishment_id
    )
    
    try:
        db.session.add(new_device)
        db.session.commit()
        flash('Dispositivo ESP32 registrado exitosamente', 'success')
    except Exception as e:
        db.session.rollback()
        flash('Error al registrar el dispositivo: ' + str(e), 'error')
    
    return redirect(url_for('manage_esp32_devices'))

@app.route('/delete_esp32_device/<int:device_id>', methods=['POST'])
@login_required
def delete_esp32_device(device_id):
    if current_user.role != 'super_admin':
        return jsonify({'error': 'Acceso no autorizado'}), 403
    
    device = Board.query.get_or_404(device_id)
    try:
        # First delete any associated heartbeat records
        heartbeat = DeviceHeartbeat.query.filter_by(mac_address=device.mac_address).first()
        if heartbeat:
            db.session.delete(heartbeat)
            
        # Then delete the device
        db.session.delete(device)
        db.session.commit()
        flash('Dispositivo ESP32 eliminado exitosamente', 'success')
    except Exception as e:
        db.session.rollback()
        flash('Error al eliminar el dispositivo: ' + str(e), 'error')

    return redirect(url_for('manage_esp32_devices'))

@app.route('/toggle_global_aerator_control', methods=['POST'])
@login_required
@super_admin_required
def toggle_global_aerator_control():
    """Activa o desactiva el control global de aireadores"""
    try:
        data = request.get_json()
        enabled = data.get('enabled', True)
        
        control = get_global_aerator_control()
        control.enabled = enabled
        control.last_modified = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires'))
        control.modified_by_id = current_user.id
        
        db.session.commit()
        
        status_message = "activado" if enabled else "desactivado"
        app.logger.info(f"Control global de aireadores {status_message} por {current_user.username}")
        
        return jsonify({
            'success': True,
            'enabled': enabled,
            'message': f'Control global de aireadores {status_message} exitosamente'
        })
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error al cambiar control global de aireadores: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error al cambiar el control global: {str(e)}'
        }), 500

@app.route('/get_global_aerator_status')
@login_required
@super_admin_required
def get_global_aerator_status():
    """Obtiene el estado actual del control global de aireadores"""
    try:
        control = get_global_aerator_control()
        return jsonify({
            'enabled': control.enabled,
            'last_modified': control.last_modified.isoformat() if control.last_modified else None,
            'modified_by': control.modified_by.username if control.modified_by else None
        })
    except Exception as e:
        app.logger.error(f"Error al obtener estado del control global: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/get_available_positions/<int:establishment_id>')
@login_required
def get_available_positions_ajax(establishment_id):
    if not current_user.can_access_establishment(establishment_id):
        return jsonify({'error': 'No tienes permiso para acceder a este establecimiento'}), 403
    
    available_positions = get_available_positions(establishment_id)
    return jsonify({'positions': available_positions})

@app.route('/silo_change_log')
@login_required
def silo_change_log():
    # Obtener parámetros de filtro
    establishment_id = request.args.get('establishment')
    silo_id = request.args.get('silo')
    
    # Obtener establecimientos accesibles para el usuario
    if current_user.role == 'super_admin':
        establishments = Establishment.query.all()
    else:
        establishments = current_user.establishments
    
    # Base query para los logs
    query = SiloChangeLog.query.join(SiloChangeLog.silo).join(Silo.establishment)
    
    # Aplicar filtros según el rol del usuario
    if current_user.role != 'super_admin':
        establishment_ids = [e.id for e in current_user.establishments]
        query = query.filter(Establishment.id.in_(establishment_ids))
    
    # Aplicar filtros de establecimiento y silo si están presentes
    if establishment_id:
        query = query.filter(Establishment.id == establishment_id)
    if silo_id:
        query = query.filter(SiloChangeLog.silo_id == silo_id)
    
    # Obtener silos para el filtro
    if establishment_id:
        silos = Silo.query.filter_by(establishment_id=establishment_id).all()
    else:
        if current_user.role == 'super_admin':
            silos = Silo.query.all()
        else:
            silos = []
            for establishment in current_user.establishments:
                silos.extend(establishment.silos)
    
    # Ordenar logs por fecha descendente
    logs = query.order_by(SiloChangeLog.timestamp.desc()).all()
    
    return render_template('silo_change_log.html', 
                         logs=logs,
                         establishments=establishments,
                         silos=silos,
                         selected_establishment=establishment_id,
                         selected_silo=silo_id)

@app.route('/delete_silo_logs', methods=['POST'])
@login_required
def delete_silo_logs():
    if current_user.role not in ['admin', 'super_admin']:
        flash('No tienes permiso para eliminar registros.', 'danger')
        return redirect(url_for('silo_change_log'))
    
    establishment_id = request.form.get('establishment_id')
    silo_id = request.form.get('silo_id')
    
    if not establishment_id:
        flash('Debes seleccionar un establecimiento.', 'danger')
        return redirect(url_for('silo_change_log'))
    
    # Verificar permisos
    if current_user.role != 'super_admin' and not current_user.can_access_establishment(int(establishment_id)):
        flash('No tienes permiso para eliminar registros de este establecimiento.', 'danger')
        return redirect(url_for('silo_change_log'))
    
    try:
        # Primero, obtener los IDs de los silos del establecimiento
        silos = Silo.query.filter_by(establishment_id=establishment_id).all()
        
        # Obtener IDs de silos
        silo_ids = [silo.id for silo in silos]
        
        if not silo_ids:
            flash('No se encontraron silos en el establecimiento seleccionado.', 'warning')
            return redirect(url_for('silo_change_log'))
        
        # Si se especificó un silo específico, filtrar solo por ese silo
        if silo_id:
            if int(silo_id) in silo_ids:  # Verificar que el silo pertenezca al establecimiento
                silo_ids = [int(silo_id)]
            else:
                flash('El silo seleccionado no pertenece al establecimiento.', 'danger')
                return redirect(url_for('silo_change_log'))
        
        # Eliminar los registros
        count = SiloChangeLog.query.filter(SiloChangeLog.silo_id.in_(silo_ids)).delete()
        db.session.commit()
        
        if count > 0:
            flash(f'Se eliminaron {count} registros exitosamente.', 'success')
        else:
            flash('No se encontraron registros para eliminar.', 'info')
            
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar registros: {str(e)}', 'danger')
    
    return redirect(url_for('silo_change_log'))

@app.route('/get_establishment_silos/<int:establishment_id>')
@login_required
def get_establishment_silos(establishment_id):
    # Verificar permisos
    if current_user.role != 'super_admin' and not current_user.can_access_establishment(establishment_id):
        return jsonify({'error': 'No autorizado'}), 403
    
    silos = Silo.query.filter_by(establishment_id=establishment_id).all()
    return jsonify({
        'silos': [{'id': silo.id, 'name': silo.name} for silo in silos]
    })

@app.route('/api/esp32/get_silos', methods=['POST'])
def get_esp32_silo_config():
    try:
        print("Recibiendo petición en /api/esp32/get_silos")
        data = request.get_json()
        print(f"Datos recibidos: {data}")
        
        mac_address = data.get('mac_address')
        print(f"MAC address extraída: {mac_address}")
        
        if not mac_address:
            print("Error: MAC address no proporcionada")
            return jsonify({'error': 'MAC address is required'}), 400
        
        # Estandarizar formato MAC
        mac_address = standardize_mac(mac_address)
        print(f"MAC address estandarizada: {mac_address}")
        
        # Buscar el dispositivo ESP32 registrado
        device = Board.query.filter_by(mac_address=mac_address).first()
        if not device:
            print(f"Error: Dispositivo con MAC {mac_address} no encontrado")
            return jsonify({'error': 'Device not registered'}), 404
        
        print(f"Dispositivo encontrado. ID: {device.id} - Establecimiento: {device.establishment_id}")

        # Obtener los silos del establecimiento
        silos = Silo.query.filter_by(establishment_id=device.establishment_id).all()
        print(f"Silos encontrados: {len(silos)}")
        
        # Preparar la respuesta
        silo_info = [{
            'id': silo.id,
            'position': silo.aerator_position
        } for silo in silos]
        
        response = {
            'silos': silo_info,
            'count': len(silo_info)
        }
        print(f"Respuesta preparada: {response}")
        
        return jsonify(response)
    except Exception as e:
        print(f"Error en get_esp32_silo_config: {str(e)}")
        app.logger.error(f"Error en get_esp32_silo_config: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

@app.route('/api/esp32/get_24h_states', methods=['POST'])
def get_24h_states():
    data = request.get_json()
    mac_address = data.get('mac_address')
    
    if not mac_address:
        return jsonify({'error': 'MAC address is required'}), 400
    
    mac_address = standardize_mac(mac_address)
    device = Board.query.filter_by(mac_address=mac_address).first()
    if not device:
        return jsonify({'error': 'Device not registered'}), 404
    
    establishment = device.establishment
    if not establishment:
        return jsonify({'error': 'Device not associated with an establishment'}), 404

    silos = Silo.query.filter_by(establishment_id=establishment.id).all()
    if not silos:
        current_time_for_response = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')).replace(minute=0, second=0, microsecond=0)
        empty_hourly_states = []
        for i in range(24):
            hour_dt = current_time_for_response + timedelta(hours=i)
            empty_hourly_states.append({'hour': hour_dt.strftime('%Y-%m-%d %H:00'), 'states': []})
        return jsonify({
            'current_time': current_time_for_response.strftime('%Y-%m-%d %H:00'),
            'states': empty_hourly_states
        })

    # Obtener datos meteorológicos para el establecimiento (una sola vez)
    weather_data_list = get_weather_data(establishment)
    
    current_time = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires'))
    current_time_rounded_str = current_time.replace(minute=0, second=0, microsecond=0).strftime('%Y-%m-%d %H:00')

    # Inicializar la estructura de respuesta para 24 horas
    base_time_for_skeleton = datetime.strptime(current_time_rounded_str, '%Y-%m-%d %H:00')
    hours_states_response = []
    for i in range(24):
        target_hour_dt = base_time_for_skeleton + timedelta(hours=i)
        target_hour_str = target_hour_dt.strftime('%Y-%m-%d %H:00')
        hours_states_response.append({'hour': target_hour_str, 'states': []})

    if not weather_data_list:
        current_app.logger.warning(f"No se obtuvieron datos meteorológicos para el establecimiento {establishment.name} (ID: {establishment.id}). Todos los silos se reportarán como apagados.")
    
    for silo in silos:
        # Obtener la configuración de aireación para buscar el tipo de cereal
        aeration_config = AerationConfig.query.filter_by(silo_id=silo.id).first()
        # Usar el tipo de cereal solo si la configuración existe y está activa
        grain_type_for_silo = aeration_config.tipo_cereal if aeration_config and aeration_config.active else None
        
        # Obtener el pronóstico horario para este silo
        silo_hourly_forecast = _get_silo_operation_forecast(silo, weather_data_list if weather_data_list else [], grain_type_for_silo)
        
        # Poblar la respuesta
        for i in range(len(hours_states_response)):
            response_hour_str = hours_states_response[i]['hour']
            
            status_for_silo_this_hour = next((s_forecast for s_forecast in silo_hourly_forecast if s_forecast['hour'] == response_hour_str), None)
            
            is_on_value = False
            if status_for_silo_this_hour:
                is_on_value = status_for_silo_this_hour['safe_to_operate']
            
            hours_states_response[i]['states'].append({
                'silo_id': silo.id,
                'position': silo.aerator_position,
                'is_on': is_on_value
            })

    # --- INICIO: APAGADO POR EXCESO DE CORRIENTE ---
    max_current = establishment.max_operating_current
    sensor_id = establishment.current_sensor_id
    current_value = None
    if sensor_id and max_current is not None:
        current_value = device_current_values.get(sensor_id)

    if current_value is not None and max_current is not None and current_value > max_current:
        app.logger.warning(f"[Protección] Establecimiento {establishment.id}: Corriente excesiva detectada: {current_value}A > {max_current}A. Forzando apagado de aireadores para la hora actual.")
        for hour_state_entry in hours_states_response:
            if hour_state_entry['hour'] == current_time_rounded_str:
                for state_entry in hour_state_entry['states']:
                    if state_entry['is_on']:
                        state_entry['is_on'] = False
                        state_entry['forced_off_reason'] = "max_current_exceeded"
    # --- FIN: APAGADO POR EXCESO DE CORRIENTE ---
    
    # --- INICIO: CONTROL GLOBAL DE AIREADORES ---
    global_control = get_global_aerator_control()
    if not global_control.enabled:
        app.logger.info(f"[Control Global] Aireadores globalmente desactivados. Forzando apagado de todos los aireadores.")
        for hour_state_entry in hours_states_response:
            for state_entry in hour_state_entry['states']:
                if state_entry['is_on']:
                    state_entry['is_on'] = False
                    state_entry['forced_off_reason'] = "global_aerator_control_disabled"
    # --- FIN: CONTROL GLOBAL DE AIREADORES ---
    
    response_data = {
        'current_time': current_time_rounded_str,
        'states': hours_states_response
    }
    
    # Marcar todos los silos del establecimiento como no modificados
    for silo in silos:
        if silo.modified:
            silo.modified = False
    db.session.commit()
    
    return jsonify(response_data)
    
@app.route('/api/check_modified/<mac_address>')
def check_modified_by_mac(mac_address):
    try:
        mac_address = standardize_mac(mac_address)
        board = Board.query.filter_by(mac_address=mac_address).first()
        
        if not board:
            return jsonify({'error': 'Placa no registrada'}), 404
            
        # --- NUEVO: Verificar sobrecorriente en cada consulta ---
        establishment = board.establishment
        sensor_id = establishment.current_sensor_id
        max_current = establishment.max_operating_current
        current_value = device_current_values.get(sensor_id)
        if current_value is not None and max_current and current_value > max_current:
            app.logger.warning(f"[Protección] Exceso de corriente en {establishment.name}: {current_value}A > {max_current}A. Marcando silos como modificados.")
            for silo in establishment.silos:
                silo.modified = True
            db.session.commit()
        # --- FIN NUEVO ---
        
        # Verificar si algún silo del establecimiento ha sido modificado
        any_modified = any(silo.modified for silo in board.establishment.silos)
        
        return jsonify({'modified': any_modified})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/log_runtime', methods=['POST'])
def log_runtime():
    try:
        data = request.get_json()
        mac_address = standardize_mac(data.get('mac_address'))
        position = data.get('position')
        duration = data.get('duration')  # Duración en horas enviada por el ESP32

        if not all([mac_address, position is not None, duration is not None]):
            return jsonify({'error': 'Faltan datos requeridos'}), 400

        # Buscar la placa y el silo correspondiente
        board = Board.query.filter_by(mac_address=mac_address).first()
        if not board:
            return jsonify({'error': 'Placa no registrada'}), 404

        silo = Silo.query.filter_by(
            establishment_id=board.establishment_id,
            aerator_position=position
        ).first()
        
        if not silo:
            return jsonify({'error': 'Silo no encontrado para esta posición'}), 404

        # Registrar el tiempo de funcionamiento
        runtime = AeratorRuntime(
            silo_id=silo.id,
            runtime_hours=float(duration)
        )
        db.session.add(runtime)
        db.session.commit()

        return jsonify({'message': 'Tiempo de funcionamiento registrado correctamente'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/log_aerator_state', methods=['POST'])
def log_aerator_state():
    try:
        data = request.get_json()
        app.logger.info(f"Datos recibidos del ESP32: {data}")
        
        mac_address = data.get('mac_address')
        position = data.get('position')
        state = data.get('state')  # 'OFF' para registrar tiempo de funcionamiento
        duration = data.get('duration')  # Duración en horas enviada por el ESP32

        app.logger.info(f"Procesando estado del aireador - MAC: {mac_address}, Posición: {position}, Estado: {state}, Duración: {duration}")

        if not all([mac_address, position is not None, duration is not None]):
            app.logger.error(f"Faltan datos requeridos - MAC: {mac_address}, Posición: {position}, Duración: {duration}")
            return jsonify({'error': 'Faltan datos requeridos'}), 400

        # Buscar la placa y el silo correspondiente
        board = Board.query.filter_by(mac_address=mac_address).first()
        if not board:
            app.logger.warning(f"No se encontró dispositivo con MAC: {mac_address}")
            return jsonify({'error': 'Placa no registrada'}), 404
        
        app.logger.info(f"Placa encontrada. ID: {board.id} - Establecimiento: {board.establishment_id}")

        silo = Silo.query.filter_by(
            establishment_id=board.establishment_id,
            aerator_position=position
        ).first()
        
        if not silo:
            app.logger.error(f"Silo no encontrado para establecimiento {board.establishment_id}, posición {position}")
            return jsonify({'error': 'Silo no encontrado para esta posición'}), 404

        app.logger.info(f"Silo encontrado: {silo.id} - {silo.name}")

        # Solo registramos cuando el estado es 'OFF' y hay una duración válida
        if state == 'OFF' and duration is not None and duration > 0:
            try:
                duration_float = float(duration)
                app.logger.info(f"Registrando tiempo de funcionamiento:")
                app.logger.info(f" - Duración recibida: {duration}")
                app.logger.info(f" - Convertida a float: {duration_float}")
                app.logger.info(f" - En minutos: {duration_float * 60:.1f}")
                app.logger.info(f" - En segundos: {duration_float * 3600:.0f}")
                
                runtime = AeratorRuntime(
                    silo_id=silo.id,
                    runtime_hours=duration_float
                )
                db.session.add(runtime)
                db.session.commit()
                
                app.logger.info(f"Tiempo de funcionamiento registrado exitosamente")
                return jsonify({'message': 'Tiempo de funcionamiento registrado correctamente'}), 200
            except ValueError as e:
                app.logger.error(f"Error al convertir duración a float: {str(e)}")
                return jsonify({'error': 'Duración inválida'}), 400
            except Exception as e:
                app.logger.error(f"Error al guardar tiempo de funcionamiento: {str(e)}")
                db.session.rollback()
                return jsonify({'error': 'Error al guardar tiempo de funcionamiento'}), 500
        else:
            app.logger.info(f"Estado {state} recibido, no se requiere registro de tiempo")
            return jsonify({'status': 'success', 'message': 'Estado recibido'}), 200

    except Exception as e:
        app.logger.error(f"Error general en log_aerator_state: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/heartbeat', methods=['POST'])
def device_heartbeat():
    """Endpoint para recibir heartbeats de los ESP32"""
    try:
        data = request.get_json()
        mac_address = data.get('mac_address')
        firmware_version = data.get('firmware_version')
        
        if not mac_address:
            app.logger.warning("Heartbeat recibido sin MAC address")
            return jsonify({'error': 'MAC address no proporcionada'}), 400
            
        # Estandarizar formato MAC
        mac_address = standardize_mac(mac_address)
        app.logger.info(f"Heartbeat recibido de MAC: {mac_address}")
        
        # Verificar si existe un dispositivo registrado con esta MAC
        board = Board.query.filter_by(mac_address=mac_address).first()
        if not board:
            app.logger.warning(f"No se encontró dispositivo con MAC: {mac_address}")
            return jsonify({'error': 'Dispositivo no registrado'}), 404
        
        app.logger.info(f"Dispositivo encontrado. ID: {board.id} - Establecimiento: {board.establishment_id}")

        # Buscar o crear registro de heartbeat
        heartbeat = DeviceHeartbeat.query.filter_by(mac_address=mac_address).first()
        if not heartbeat:
            app.logger.info(f"Creando nuevo registro de heartbeat para MAC: {mac_address}")
            heartbeat = DeviceHeartbeat(mac_address=mac_address, last_heartbeat=datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')))
            db.session.add(heartbeat)
        
        # Actualizar timestamp y estado usando función que garantiza hora correcta de Argentina
        now = get_argentina_time()
        
        # DEBUG: Log de timestamps para investigar discrepancia
        app.logger.info(f"DEBUG - Timestamp Argentina corregido: {now}")
        app.logger.info(f"DEBUG - Timestamp UTC: {datetime.utcnow()}")
        app.logger.info(f"DEBUG - Zona horaria: {now.tzinfo}")
        
        # Asegurarse de que last_heartbeat tenga zona horaria
        if heartbeat.last_heartbeat is None:
            heartbeat.last_heartbeat = now
        elif heartbeat.last_heartbeat.tzinfo is None:
            heartbeat.last_heartbeat = heartbeat.last_heartbeat.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
        
        old_status = heartbeat.status
        heartbeat.last_heartbeat = now
        heartbeat.status = 'online'
        if firmware_version:
            heartbeat.firmware_version = firmware_version
        
        # Determinar slot de tiempo fijo basado en los minutos actuales
        current_minute = now.minute
        if current_minute <= 20:
            slot_start = 0
            slot_end = 20
            slot_name = "0-20"
        elif current_minute <= 40:
            slot_start = 21
            slot_end = 40
            slot_name = "21-40"
        else:
            slot_start = 41
            slot_end = 59
            slot_name = "41-59"
        
        # Crear timestamp normalizado para el slot (usar el minuto medio del slot)
        slot_middle_minute = (slot_start + slot_end) // 2
        normalized_time = now.replace(minute=slot_middle_minute, second=0, microsecond=0)
        
        app.logger.info(f"Heartbeat en slot {slot_name} (minuto {current_minute}), timestamp normalizado: {normalized_time}")
        
        # Verificar si ya existe un registro para este slot específico
        should_save_history = False
        existing_history = DeviceHeartbeatHistory.query.filter(
            DeviceHeartbeatHistory.mac_address == mac_address,
            DeviceHeartbeatHistory.timestamp >= normalized_time.replace(minute=slot_start),
            DeviceHeartbeatHistory.timestamp <= normalized_time.replace(minute=slot_end, second=59)
        ).first()
        
        if not existing_history:
            # No existe registro para este slot, guardarlo
            should_save_history = True
            app.logger.info(f"No existe registro para slot {slot_name}, guardando en historial")
        else:
            app.logger.info(f"Ya existe registro para slot {slot_name}, descartando heartbeat")
        
        if should_save_history:
            history_entry = DeviceHeartbeatHistory(mac_address=mac_address, timestamp=normalized_time)
            db.session.add(history_entry)
        
        try:
            db.session.commit()
            app.logger.info(f"Heartbeat actualizado: MAC={mac_address}, Estado anterior={old_status}, Nuevo estado=online, Historial={'guardado' if should_save_history else 'no guardado'}")
        except Exception as db_error:
            app.logger.error(f"Error al guardar heartbeat en la base de datos: {str(db_error)}")
            db.session.rollback()
            return jsonify({'error': 'Error al guardar heartbeat'}), 500
        
        return jsonify({'status': 'success'})
    except Exception as e:
        app.logger.error(f"Error en device_heartbeat: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/reboot', methods=['POST'])
def device_reboot():
    """Endpoint para registrar reinicios de los ESP32"""
    try:
        data = request.get_json()
        mac_address = data.get('mac_address')
        reason = data.get('reason', 'No especificado')
        
        if not mac_address:
            app.logger.warning("Reinicio recibido sin MAC address")
            return jsonify({'error': 'MAC address no proporcionada'}), 400
            
        # Estandarizar formato MAC
        mac_address = standardize_mac(mac_address)
        app.logger.info(f"Reinicio registrado de MAC: {mac_address}, Razón: {reason}")
        
        # Verificar si existe un dispositivo registrado con esta MAC
        board = Board.query.filter_by(mac_address=mac_address).first()
        if not board:
            app.logger.warning(f"No se encontró dispositivo con MAC: {mac_address}")
            return jsonify({'error': 'Dispositivo no registrado'}), 404
        
        app.logger.info(f"Dispositivo encontrado. ID: {board.id} - Establecimiento: {board.establishment_id}")

        # Crear registro de reinicio
        now = get_argentina_time()
        reboot = Esp32Reboot(
            mac_address=mac_address, 
            reboot_time=now,
            reason=reason
        )
        db.session.add(reboot)
        
        # Purgar datos antiguos del historial de heartbeats (> 7 días)
        seven_days_ago = now - timedelta(days=7)
        app.logger.info(f"Purgando datos de historial de heartbeats anteriores a: {seven_days_ago}")
        
        try:
            # Purgar historial de heartbeats antiguos
            deleted_heartbeats = DeviceHeartbeatHistory.query.filter(
                DeviceHeartbeatHistory.timestamp < seven_days_ago
            ).delete()
            
            # Purgar logs de acciones antiguos (también 7 días)
            deleted_actions = DeviceActionLog.query.filter(
                DeviceActionLog.timestamp < seven_days_ago
            ).delete()
            
            db.session.commit()
            app.logger.info(f"Reinicio registrado para MAC={mac_address}, Razón={reason}")
            app.logger.info(f"Purga completada: {deleted_heartbeats} registros de heartbeat eliminados, {deleted_actions} registros de acciones eliminados")
            
        except Exception as db_error:
            app.logger.error(f"Error al guardar reinicio o purgar datos: {str(db_error)}")
            db.session.rollback()
            return jsonify({'error': 'Error al guardar reinicio'}), 500
        
        return jsonify({'status': 'success'})
    except Exception as e:
        app.logger.error(f"Error en device_reboot: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/device_action_log', methods=['POST'])
def device_action_log():
    """Endpoint para registrar acciones/intentos de los ESP32 (encender/apagar aireadores)"""
    try:
        data = request.get_json()
        mac_address = data.get('mac_address')
        action = data.get('action')  # 'ON' o 'OFF'
        position = data.get('position')  # Posición del aireador (1-8)
        result = data.get('result')  # 'success' o 'error'
        message = data.get('message', '')  # Mensaje opcional
        
        app.logger.info(f"Log de acción recibido - MAC: {mac_address}, Acción: {action}, Posición: {position}, Resultado: {result}")
        
        if not all([mac_address, action, position is not None, result]):
            app.logger.error(f"Faltan datos requeridos para log de acción")
            return jsonify({'error': 'Faltan datos requeridos (mac_address, action, position, result)'}), 400
        
        # Validar valores
        if action not in ['ON', 'OFF']:
            return jsonify({'error': 'action debe ser ON o OFF'}), 400
        
        if result not in ['success', 'error']:
            return jsonify({'error': 'result debe ser success o error'}), 400
        
        try:
            position = int(position)
            if position < 1 or position > 8:
                return jsonify({'error': 'position debe estar entre 1 y 8'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': 'position debe ser un número entero'}), 400
        
        # Estandarizar formato MAC
        mac_address = standardize_mac(mac_address)
        
        # Verificar si existe un dispositivo registrado con esta MAC
        board = Board.query.filter_by(mac_address=mac_address).first()
        if not board:
            app.logger.warning(f"No se encontró dispositivo con MAC: {mac_address}")
            return jsonify({'error': 'Dispositivo no registrado'}), 404
        
        app.logger.info(f"Dispositivo encontrado. ID: {board.id} - Establecimiento: {board.establishment_id}")
        
        # Crear registro de acción
        action_log = DeviceActionLog(
            mac_address=mac_address,
            timestamp=get_argentina_time(),
            action=action,
            position=position,
            result=result,
            message=message[:255] if message else None  # Truncar mensaje si es muy largo
        )
        db.session.add(action_log)
        
        try:
            db.session.commit()
            app.logger.info(f"Log de acción registrado: MAC={mac_address}, Acción={action}, Posición={position}, Resultado={result}")
            return jsonify({'status': 'success', 'message': 'Log de acción registrado correctamente'})
        except Exception as db_error:
            app.logger.error(f"Error al guardar log de acción: {str(db_error)}")
            db.session.rollback()
            return jsonify({'error': 'Error al guardar log de acción'}), 500
            
    except Exception as e:
        app.logger.error(f"Error en device_action_log: {str(e)}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/device/status/<mac_address>', methods=['GET'])
def get_device_status_endpoint(mac_address):
    """Endpoint para obtener el estado actual de un dispositivo"""
    try:
        mac_address = standardize_mac(mac_address)
        status = get_device_status(mac_address)
        return jsonify({'status': status})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_device_status_for_establishment(establishment):
    """
    Obtiene el estado del dispositivo para un establecimiento
    """
    try:
        board = Board.query.filter_by(establishment_id=establishment.id).first()
        if not board:
            app.logger.debug(f"No se encontró placa para el establecimiento {establishment.name}")
            return {
                'status': 'no_device', 
                'status_message': 'Sin dispositivo configurado',
                'last_heartbeat_offline': None,
                'firmware_version': 'N/A'
            }
            
        heartbeat = DeviceHeartbeat.query.filter_by(mac_address=board.mac_address).first()
        if not heartbeat:
            app.logger.debug(f"No se encontró heartbeat para la placa {board.mac_address}")
            return {
                'status': 'no_data', # Nuevo estado para dispositivo registrado pero sin datos
                'status_message': 'Dispositivo sin datos de actividad',
                'last_heartbeat_offline': None,
                'firmware_version': 'N/A'
            }
            
        now = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires'))
        
        # Asegurarse de que last_heartbeat tenga zona horaria
        if heartbeat.last_heartbeat is None:
            last_heartbeat = now
        elif heartbeat.last_heartbeat.tzinfo is None:
            last_heartbeat = pytz.timezone('America/Argentina/Buenos_Aires').localize(heartbeat.last_heartbeat)
            
        time_diff = now - last_heartbeat
        
        app.logger.debug(f"Último heartbeat de {board.mac_address} hace {time_diff.total_seconds() / 60:.1f} minutos")
        
        # Actualizar el estado en la base de datos y retornarlo
        if time_diff > timedelta(minutes=5):
            new_status = 'offline'
            app.logger.info(f"Dispositivo {board.mac_address} marcado como offline (último heartbeat hace {time_diff.total_seconds() / 60:.1f} minutos)")
        elif time_diff > timedelta(minutes=2):
            new_status = 'warning'
            app.logger.info(f"Dispositivo {board.mac_address} marcado como warning (último heartbeat hace {time_diff.total_seconds() / 60:.1f} minutos)")
        else:
            new_status = 'online'
            app.logger.debug(f"Dispositivo {board.mac_address} online (último heartbeat hace {time_diff.total_seconds() / 60:.1f} minutos)")
        
        # Solo actualizar si el estado ha cambiado
        if heartbeat.status != new_status:
            app.logger.info(f"Actualizando estado de {board.mac_address} de {heartbeat.status} a {new_status}")
            heartbeat.status = new_status
            db.session.commit()
        
        status_info = {
            'status': new_status, 
            'status_message': 'Desconocido',
            'last_heartbeat_offline': None,  # Asegurar inicialización correcta aquí
            'firmware_version': heartbeat.firmware_version if heartbeat.firmware_version else 'N/A'
        }
        
        if new_status == 'online':
            status_info['status_message'] = 'Dispositivo conectado'
        elif new_status == 'offline':
            status_info['status_message'] = 'Dispositivo desconectado'
            if heartbeat and heartbeat.last_heartbeat: # Usar el valor original de la BBDD
                status_info['last_heartbeat_offline'] = format_datetime(heartbeat.last_heartbeat)
        elif new_status == 'warning':
            status_info['status_message'] = 'Dispositivo con conexión inestable'
            if heartbeat and heartbeat.last_heartbeat: # Usar el valor original de la BBDD
                status_info['last_heartbeat_offline'] = format_datetime(heartbeat.last_heartbeat)
        
        return status_info
        
    except Exception as e:
        app.logger.error(f"Error obteniendo estado del dispositivo: {str(e)}")
        return {
            'status': 'error',
            'status_message': 'Error al obtener estado',
            'last_heartbeat_offline': None,
            'firmware_version': 'N/A'
        }

def get_global_aerator_control():
    """
    Obtiene el estado del control global de aireadores.
    Si no existe un registro, crea uno con el estado habilitado por defecto.
    """
    control = GlobalAeratorControl.query.first()
    if not control:
        # Crear registro inicial con aireadores habilitados
        control = GlobalAeratorControl(enabled=True)
        db.session.add(control)
        db.session.commit()
    return control

@app.context_processor
def utility_processor():
    def format_datetime(value, format='%Y-%m-%d %H:%M:%S'):
        if value is None:
            return ""
        if isinstance(value, str):
            try:
                value = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                return value
        return value.strftime(format)

    def get_active_alerts():
        return ProtectionAlert.query.filter_by(active=True).order_by(ProtectionAlert.timestamp.desc()).all()

    def get_all_establishments():
        return Establishment.query.all()

    def get_establishment_status(establishment):
        """Obtiene el estado del dispositivo para un establecimiento específico."""
        status_dict = get_device_status_for_establishment(establishment)
        app.logger.info(f"[DEBUG BASE.HTML] Est: '{establishment.name}', Status_dict: {status_dict}") # Log para depuración
        return status_dict

    return dict(
        format_datetime=format_datetime,
        get_active_alerts=get_active_alerts,
        get_all_establishments=get_all_establishments,
        get_establishment_status=get_establishment_status
    )

@app.route('/raw_stats', methods=['GET'])
@login_required
def raw_stats():
    try:
        # Obtener el periodo de tiempo desde el parámetro de la URL
        period = request.args.get('period', '30')
        days = int(period)
        
        # Validar que el periodo sea 7 o 30 días
        if days not in [7, 30]:
            days = 30
            period = '30'
        
        establishments = get_user_establishments()
        app.logger.info(f"Obtenidos {len(establishments)} establecimientos")
        
        stats = []
        tz = pytz.timezone('America/Argentina/Buenos_Aires')
        end_date = datetime.now(tz)
        start_date = end_date - timedelta(days=days)
        
        app.logger.info(f"Buscando datos desde {start_date} hasta {end_date} (periodo: {days} días)")

        for establishment in establishments:
            app.logger.info(f"Procesando establecimiento: {establishment.name}")
            
            # Obtener estado del dispositivo del establecimiento
            device_status = get_device_status_for_establishment(establishment)
            
            for silo in establishment.silos:
                app.logger.info(f"Procesando silo: {silo.name} (posición {silo.aerator_position})")
                
                # Obtener registros de tiempo de funcionamiento de los últimos 30 días
                runtimes = AeratorRuntime.query.filter(
                    AeratorRuntime.silo_id == silo.id,
                    AeratorRuntime.timestamp >= start_date,
                    AeratorRuntime.timestamp <= end_date
                ).order_by(AeratorRuntime.timestamp.desc()).all()
                
                app.logger.info(f"Encontrados {len(runtimes)} registros en los últimos 30 días")
                
                # Calcular tiempo total de funcionamiento del último mes
                total_hours = sum(runtime.runtime_hours for runtime in runtimes) if runtimes else 0
                last_runtime = runtimes[0] if runtimes else None

                # Obtener total histórico
                all_runtimes = AeratorRuntime.query.filter_by(silo_id=silo.id).all()
                total_hours_all_time = sum(r.runtime_hours for r in all_runtimes)

                # Calcular horas por día para los últimos 30 días
                daily_hours = {}
                days_with_data = 0
                
                if runtimes:
                    current_date = None
                    daily_total = 0
                    
                    for runtime in sorted(runtimes, key=lambda x: x.timestamp):
                        runtime_date = runtime.timestamp.date()
                        
                        if current_date is None:
                            current_date = runtime_date
                            daily_total = runtime.runtime_hours
                        elif runtime_date == current_date:
                            daily_total += runtime.runtime_hours
                        else:
                            if daily_total > 0:
                                days_with_data += 1
                            daily_hours[current_date.isoformat()] = float(daily_total)
                            current_date = runtime_date
                            daily_total = runtime.runtime_hours
                    
                    # No olvidar el último día
                    if daily_total > 0:
                        days_with_data += 1
                    if current_date:
                        daily_hours[current_date.isoformat()] = float(daily_total)

                # Calcular promedio diario solo para días con datos
                avg_daily_hours = total_hours / days_with_data if days_with_data > 0 else 0

                stats.append({
                    'establishment_name': establishment.name,
                    'silo_name': silo.name,
                    'position': silo.aerator_position,
                    'device_status': device_status,
                    'last_runtime': format_datetime(last_runtime.timestamp) if last_runtime else None,
                    'last_duration': float(last_runtime.runtime_hours) if last_runtime else 0.0,
                    'total_hours': float(total_hours),
                    'days_with_data': int(days_with_data),
                    'avg_daily_hours': float(avg_daily_hours),
                    'total_hours_all_time': float(total_hours_all_time),
                    'daily_hours': daily_hours
                })

        return render_template('raw_stats.html', stats=stats, period=period)
    except Exception as e:
        app.logger.error(f"Error en raw_stats: {str(e)}")
        return render_template('raw_stats.html', stats=[], error=str(e), period='30')

@app.route('/reset_password/<int:user_id>', methods=['GET', 'POST'])
@login_required
def reset_password(user_id):
    # Solo super_admin y admin pueden restablecer contraseñas
    if current_user.role not in ['super_admin', 'admin']:
        flash('No tienes permiso para restablecer contraseñas', 'danger')
        return redirect(url_for('index'))
    
    user = User.query.get_or_404(user_id)
    
    # Verificar que el admin solo pueda modificar usuarios que él creó
    if current_user.role == 'admin' and user.created_by_id != current_user.id:
        flash('Solo puedes restablecer contraseñas de usuarios que has creado', 'danger')
        return redirect(url_for('manage_users'))
    
    if request.method == 'POST':
        new_password = request.form.get('new_password')
        if new_password:
            # Guardar el hash anterior para diagnóstico
            old_hash = user.password_hash
            
            # Establecer la nueva contraseña
            user.set_password(new_password)
            
            # Registrar el cambio
            print(f"Restableciendo contraseña para usuario {user.username}")
            print(f"Hash anterior: {old_hash[:20]}...")
            print(f"Nuevo hash: {user.password_hash[:20]}...")
            
            db.session.commit()
            flash(f'Contraseña restablecida para {user.username}', 'success')
            return redirect(url_for('manage_users'))
    
    return render_template('reset_password.html', user=user)

# Diccionario global para almacenar el último valor de corriente por dispositivo
device_current_values = {}

@app.route('/api/corriente', methods=['POST'])
def recibir_corriente():
    """
    Endpoint para recibir el valor de corriente desde un ESP32 sensor.
    Espera un JSON con las claves 'device_id' y 'corriente'.
    """
    global device_current_values
    data = request.get_json()
    if data and 'device_id' in data and 'corriente' in data:
        device_id = data['device_id']
        try:
            current_value = float(data['corriente'])
            device_current_values[device_id] = current_value
            print(f"Valor de corriente recibido para {device_id}: {current_value}") # Log
            return jsonify({'status': 'ok', 'mensaje': 'Valor recibido para ' + device_id}), 200
        except ValueError:
            return jsonify({'status': 'error', 'mensaje': 'Valor de corriente inválido'}), 400
    else:
        return jsonify({'status': 'error', 'mensaje': "JSON inválido o claves requeridas ('device_id', 'corriente') faltantes"}), 400

@app.route('/api/corriente', methods=['GET'])
def obtener_corriente():
    """
    Endpoint para que otros ESP32 (controladores) obtengan el último valor de corriente
    para un dispositivo específico, usando un parámetro query 'device_id'.
    Ejemplo: /api/corriente?device_id=sensor_patio
    """
    global device_current_values
    device_id = request.args.get('device_id')

    if not device_id:
        return jsonify({'status': 'error', 'mensaje': "Parámetro 'device_id' faltante en la URL"}), 400

    last_value = device_current_values.get(device_id)

    if last_value is not None:
        # Buscar el establecimiento asociado a este sensor para obtener el máximo de corriente
        establishment = Establishment.query.filter_by(current_sensor_id=device_id).first()
        max_current = None
        
        if establishment:
            max_current = establishment.max_operating_current
            app.logger.debug(f"Establecimiento encontrado para sensor {device_id}: {establishment.name}")
            app.logger.debug(f"Valor máximo de corriente: {max_current}")
        else:
            app.logger.warning(f"No se encontró establecimiento para el sensor {device_id}")
        
        # Incluir el valor máximo en la respuesta
        return jsonify({
            'device_id': device_id, 
            'corriente': last_value,
            'max_corriente': max_current
        }), 200
    else:
        # Puedes decidir qué devolver si aún no se ha recibido ningún valor
        # Opción 1: Devolver un error o un estado indicativo
        return jsonify({'status': 'error', 'mensaje': f'No se ha recibido ningún valor para el dispositivo {device_id}'}), 404
        # Opción 2: Devolver un valor predeterminado (ej. 0 o null)
        # return jsonify({'corriente': None}), 200

@app.route('/silo/<int:silo_id>/set_mode', methods=['POST'])
@login_required
def set_silo_manual_mode(silo_id):
    current_app.logger.info(f"Recibida solicitud para cambiar modo del silo {silo_id}.")
    silo = Silo.query.get_or_404(silo_id)
    mode = request.json.get('mode')
    current_app.logger.info(f"Silo ID: {silo_id}, Modo recibido: {mode}")

    if mode not in ['auto', 'on', 'off', 'ia']:
        current_app.logger.warning(f"Modo inválido '{mode}' recibido para silo {silo_id}.")
        return jsonify({'success': False, 'error': 'Modo inválido'}), 400

    try:
        # Si se cambia a un modo no IA, desactivar la configuración de IA si estaba activa
        if mode in ['auto', 'on', 'off']:
            config = AerationConfig.query.filter_by(silo_id=silo.id).one_or_none()
            if config and config.active:
                config.active = False
                current_app.logger.info(f"Modo IA (AerationConfig) desactivado para silo {silo_id} debido a cambio a modo {mode}.")
                # silo.modified = True ya se establece abajo, cubriendo este cambio también

        silo.manual_mode = mode
        silo.modified = True # Asegurarse que esto también se registra si es necesario un log de cambios
        db.session.commit()
        current_app.logger.info(f"Modo del silo {silo_id} cambiado a '{mode}' y guardado en DB.")

        current_mode_response = 'manual'
        manual_mode_status_response = mode

        if mode == 'auto':
            current_mode_response = 'auto'
            manual_mode_status_response = 'auto'
        elif mode == 'ia': # El modo guardado y enviado desde el frontend es 'ia'
            current_mode_response = 'intelligent' # Para la UI, se puede seguir llamando 'intelligent'
            manual_mode_status_response = 'ia'    # El valor real del modo
        # Para 'on' y 'off', current_mode_response ya es 'manual' y manual_mode_status_response es el modo ('on' o 'off')

        return jsonify({
            'success': True,
            'current_mode': current_mode_response,
            'manual_mode_status': manual_mode_status_response
        })

    except IntegrityError as e:
        db.session.rollback()
        current_app.logger.error(f"Error de integridad al guardar modo para silo {silo_id} (modo: {mode}): {str(e)}")
        return jsonify({'success': False, 'error': 'Error de integridad al guardar en la base de datos.'}), 500
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error inesperado al guardar modo para silo {silo_id} (modo: {mode}): {str(e)}")
        return jsonify({'success': False, 'error': 'Error inesperado al procesar la solicitud.'}), 500

@app.route('/silo/<int:silo_id>/operation-hours', methods=['GET'])
@login_required
def api_get_silo_operation_hours(silo_id):
    silo = Silo.query.get_or_404(silo_id)
    # Verificar si el usuario tiene acceso al establecimiento del silo
    if not current_user.can_access_establishment(silo.establishment_id):
        return jsonify({'error': 'Acceso no autorizado'}), 403
        
    operation_hours_data = get_silo_operation_hours(silo_id)
    if operation_hours_data is None:
        return jsonify({'error': 'No se pudieron obtener los datos de operación'}), 500
        
    return jsonify(operation_hours_data)


def _get_latest_silo_temperatures(silo_id):
    """
    Recupera las últimas temperaturas registradas para todos los sensores
    asignados a la barra de un silo específico.

    Args:
        silo_id (int): El ID del silo.

    Returns:
        dict: Un diccionario donde las claves son los ID de los sensores (int)
              y los valores son diccionarios con 'temperatura' (float) y 'timestamp' (datetime).
              Si un sensor no tiene lecturas, su valor será None.
              Devuelve un diccionario vacío si el silo no se encuentra,
              no tiene barra asignada, o la barra no tiene sensores con lecturas.
    """
    silo = Silo.query.get(silo_id)
    if not silo:
        current_app.logger.error(f"Silo con ID {silo_id} no encontrado al intentar obtener temperaturas.")
        return {}

    # Asumiendo que silo.barra_sensores_asociada es la forma de acceder a la barra
    # y que está configurada con lazy='joined' o se maneja adecuadamente.
    barra_sensores = silo.barra_sensores_asociada
    if not barra_sensores:
        current_app.logger.warning(f"Silo con ID {silo_id} (Nombre: {silo.name}) no tiene una barra de sensores asignada.")
        return {}

    latest_temperatures = {}
    # Iterar sobre los campos sensorX_id de BarraSensores
    for i in range(1, 9):  # Para sensor1_id hasta sensor8_id
        sensor_id_attr = f'sensor{i}_id'
        sensor_id = getattr(barra_sensores, sensor_id_attr, None)
        
        if sensor_id:
            # Obtener la última lectura para este sensor_id
            # Se asume que LecturaTemperatura, desc y current_app están disponibles en este contexto.
            last_reading = LecturaTemperatura.query.filter_by(sensor_id=sensor_id)\
                .order_by(desc(LecturaTemperatura.timestamp))\
                .first()
            
            if last_reading:
                latest_temperatures[sensor_id] = {
                    'temperatura': last_reading.temperatura,
                    'timestamp': last_reading.timestamp
                }
            else:
                latest_temperatures[sensor_id] = None # Sensor existe pero no tiene lecturas
                current_app.logger.info(f"No se encontraron lecturas para el sensor ID {sensor_id} (posición {i} en barra {barra_sensores.nombre}) del silo {silo.name}.")
        # else: No hay sensor_id en esta posición de la barra.
    
    if not latest_temperatures:
        # Verificar si la barra tiene sensores asignados para diferenciar el log
        has_assigned_sensors = any(getattr(barra_sensores, f'sensor{j}_id', None) for j in range(1,9))
        if has_assigned_sensors:
            current_app.logger.warning(f"La barra {barra_sensores.nombre} (Silo: {silo.name}) tiene sensores asignados, pero no se encontraron lecturas para ninguno.")
        else:
            current_app.logger.info(f"La barra {barra_sensores.nombre} (Silo: {silo.name}) no tiene sensores asignados, por lo tanto no se recuperaron temperaturas.")

    return latest_temperatures


def _interpolate(x, x0, y0, x1, y1):
    """Función de interpolación lineal simple."""
    if x0 == x1:
        return y0
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0)

def _get_equilibrium_humidity(grain_type, target_grain_moisture, grain_temp):
    """
    Calcula la humedad relativa del aire de equilibrio (ERH) para una humedad de grano objetivo
    a una temperatura de grano específica, usando interpolación bilineal inversa.

    Args:
        grain_type (str): Tipo de grano ('trigo', 'soja', 'maiz').
        target_grain_moisture (float): La humedad que se desea alcanzar en el grano (%).
        grain_temp (float): La temperatura actual del grano (°C).

    Returns:
        float or None: La humedad relativa del aire de equilibrio (%), o None si está fuera de rango.
    """
    if grain_type not in EQUILIBRIUM_TABLES:
        return None
    table = EQUILIBRIUM_TABLES[grain_type]
    print(f"[DEBUG _get_equilibrium_humidity] ENTER | grain_type={grain_type}, target_grain_moisture={target_grain_moisture}, grain_temp={grain_temp}")

    # 1. Interpolar a lo largo del eje de temperatura para cada columna de HR
    air_temps = sorted([float(t) for t in table.keys()])
    if not (air_temps[0] <= grain_temp <= air_temps[-1]):
        return None # Temperatura del grano fuera de rango de la tabla

    # Encontrar temperaturas que rodean la temperatura del grano
    t_low = max(t for t in air_temps if t <= grain_temp)
    t_high = min(t for t in air_temps if t >= grain_temp)

    # 2. Interpolar inversamente a lo largo del eje de humedad del grano para t_low y t_high
    def get_rh_for_temp(temp_row_data):
        # Las claves de temp_row_data son enteros (30, 35, ...). No convertir a str.
        rh_values = sorted([int(rh) for rh in temp_row_data.keys()])
        moisture_values = [temp_row_data[rh] for rh in rh_values]
        
        if not (min(moisture_values) <= target_grain_moisture <= max(moisture_values)):
            return None # Humedad objetivo fuera de rango para esta temperatura

        # Encontrar humedades de grano que rodean la humedad objetivo
        for i in range(len(moisture_values) - 1):
            if moisture_values[i] <= target_grain_moisture <= moisture_values[i+1] or \
               moisture_values[i+1] <= target_grain_moisture <= moisture_values[i]:
                m_low, m_high = moisture_values[i], moisture_values[i+1]
                rh_low, rh_high = rh_values[i], rh_values[i+1]
                return _interpolate(target_grain_moisture, m_low, rh_low, m_high, rh_high)
        return None

    rh_at_t_low = get_rh_for_temp(table[int(t_low)])
    rh_at_t_high = get_rh_for_temp(table[int(t_high)])

    if rh_at_t_low is None or rh_at_t_high is None:
        return None

    # 3. Interpolar finalmente entre las dos humedades relativas calculadas
    result_rh = _interpolate(grain_temp, t_low, rh_at_t_low, t_high, rh_at_t_high)
    print(f"[DEBUG _get_equilibrium_humidity] grain_temp={grain_temp}, t_low={t_low}, t_high={t_high}, "
          f"rh_at_t_low={rh_at_t_low}, rh_at_t_high={rh_at_t_high}, "
          f"target_grain_moisture={target_grain_moisture}, result_rh={result_rh}")
    return result_rh

def _extract_temp_values(latest_temperatures):
    """
    Normaliza la estructura devuelta por `_get_latest_silo_temperatures` para obtener
    una lista de valores de temperatura (float).

    Puede recibir:
      - Un dict {sensor_id: {'temperatura': float, 'timestamp': datetime}}
      - Una lista de dicts [{'temperature': ..}, ...]
    """
    if isinstance(latest_temperatures, dict):
        temp_values = []
        for v in latest_temperatures.values():
            if v is not None:
                if isinstance(v, dict) and 'temperatura' in v:
                    temp_values.append(v['temperatura'])
                elif isinstance(v, (int, float)):
                    # Fallback para compatibilidad con formato anterior
                    temp_values.append(v)
        return temp_values
    # Fallback para lista de dicts u otros formatos futuros
    return [t.get('temperature') for t in latest_temperatures if isinstance(t, dict) and t.get('temperature') is not None]


def _check_temperature_data_freshness(latest_temperatures, max_age_days=7):
    """
    Verifica si los datos de temperatura son lo suficientemente recientes.
    
    Args:
        latest_temperatures (dict): Diccionario con datos de sensores
        max_age_days (int): Máximo número de días permitidos para considerar datos válidos
        
    Returns:
        tuple: (bool, datetime or None) - (datos_frescos, timestamp_mas_antiguo)
    """
    if not latest_temperatures:
        return False, None
    
    from datetime import datetime, timedelta
    import pytz
    
    now = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires'))
    max_age = timedelta(days=max_age_days)
    oldest_timestamp = None
    
    for sensor_data in latest_temperatures.values():
        if sensor_data is not None and isinstance(sensor_data, dict) and 'timestamp' in sensor_data:
            timestamp = sensor_data['timestamp']
            
            # Convertir timestamp a timezone-aware si no lo está
            if timestamp.tzinfo is None:
                timestamp = pytz.timezone('America/Argentina/Buenos_Aires').localize(timestamp)
            
            # Encontrar el timestamp más antiguo
            if oldest_timestamp is None or timestamp < oldest_timestamp:
                oldest_timestamp = timestamp
            
            # Verificar si algún dato es demasiado antiguo
            age = now - timestamp
            if age > max_age:
                return False, oldest_timestamp
    
    return True, oldest_timestamp


def _evaluate_intelligent_mode(silo, grain_type, hour_weather_data):
    """
    Evalúa si es beneficioso encender la aireación para un silo en modo inteligente.
    Combina las lógicas de "Alcanzar Temperatura" y "Alcanzar Humedad".
    """
    # 1. Obtener datos básicos (temperaturas internas y clima externo)
    latest_temperatures = _get_latest_silo_temperatures(silo.id)
    if not latest_temperatures:
        current_app.logger.warning(f"Silo {silo.id} [Intelligent]: No se encontraron lecturas de temperatura. No se puede operar.")
        return False

    # 1.1. Verificar antigüedad de los datos de temperatura
    data_is_fresh, oldest_timestamp = _check_temperature_data_freshness(latest_temperatures, max_age_days=7)
    if not data_is_fresh:
        # Desactivar automáticamente el modo inteligente
        config = AerationConfig.query.filter_by(silo_id=silo.id).one_or_none()
        if config and config.active:
            config.active = False
            silo.manual_mode = 'auto'  # Cambiar a modo automático como fallback
            db.session.commit()
            
            age_str = "sin datos" if oldest_timestamp is None else f"datos más antiguos de {oldest_timestamp.strftime('%Y-%m-%d %H:%M')}"
            current_app.logger.warning(
                f"Silo {silo.id} [Intelligent]: Modo inteligente DESACTIVADO automáticamente. "
                f"Los datos de temperatura son muy antiguos ({age_str}). "
                f"Cambiando a modo automático."
            )
            
            # Agregar notificación para mostrar al usuario
            from flask import session
            if 'intelligent_mode_disabled_notifications' not in session:
                session['intelligent_mode_disabled_notifications'] = []
            
            notification = {
                'silo_id': silo.id,
                'silo_name': silo.name,
                'reason': f"Datos de sensores muy antiguos ({age_str})",
                'timestamp': datetime.now(pytz.timezone('America/Argentina/Buenos_Aires')).isoformat()
            }
            session['intelligent_mode_disabled_notifications'].append(notification)
            session.modified = True
            
        return False

    temp_externa = hour_weather_data.get('temperature')
    hum_externa = hour_weather_data.get('humidity')
    print(f"[DEBUG _evaluate_intelligent_mode] Silo={silo.id}, grain_type={grain_type}, "
          f"temp_externa={temp_externa}, hum_externa={hum_externa}")
    if temp_externa is None or hum_externa is None:
        current_app.logger.warning(f"Silo {silo.id} [Intelligent]: Faltan datos meteorológicos. No se puede operar.")
        return False

    # 2. Obtener la configuración del modo inteligente para el silo
    config = getattr(silo, "aeration_config", None)
    if not config:
        # Fallback por si la relación aún no está cargada
        config = AerationConfig.query.filter_by(silo_id=silo.id).one_or_none()
    if not config:
        current_app.logger.warning(
            f"Silo {silo.id} [Intelligent]: No tiene una configuración de modo inteligente. No se puede operar.")
        return False

    # 3. Lógica de Decisión por Prioridad

    # 3.1. Evaluar "Alcanzar Temperatura" (Prioridad 1)
    decision_temperatura = False
    # ------------------------------------------------------------------
    # Normalizar configuraciones que podrían venir como NULL en la BD
    delta_temp_min = config.delta_temp_min if config.delta_temp_min is not None else 0.0
    delta_temp_hyst = config.delta_temp_hyst if config.delta_temp_hyst is not None else 0.0
    target_temp_cfg = config.target_temp  # puede ser None, eso es válido

    if config and config.achieve_temperature:
        temp_values = _extract_temp_values(latest_temperatures)
        if not temp_values:
            current_app.logger.warning(f"Silo {silo.id} [Temp]: No hay lecturas de temperatura válidas.")
        else:
            temp_max_interna = max(temp_values)
            # Decidir si conviene enfriar basado en temperatura objetivo y delta
            necesita_enfriar = False
            aire_util = False
            if config.target_temp is not None:
                if target_temp_cfg is not None:
                    necesita_enfriar = temp_max_interna > (target_temp_cfg + delta_temp_hyst)
            # Utilidad del aire externo
            aire_util = temp_externa < (temp_max_interna - delta_temp_min)
            decision_temperatura = necesita_enfriar and aire_util
            current_app.logger.debug(
                f"Silo {silo.id} [Temp]: Decisión={decision_temperatura}. T_max={temp_max_interna:.1f}, T_ext={temp_externa:.1f}, "
                f"delta_temp_min={delta_temp_min}, delta_temp_hyst={delta_temp_hyst}, target_temp={target_temp_cfg}"
            )

    # Si la temperatura ya decidió encender, esa es la decisión final.
    if decision_temperatura:
        # Prioridad absoluta: si la temperatura requiere airear, la humedad no se evalúa
        print(f"[DEBUG _evaluate_intelligent_mode] decision_temperatura=True, RETURN TRUE (precedencia)")
        print(f"[DEBUG _evaluate_intelligent_mode] decision_temperatura=True, returning True")
        return True

    # 3.2. Evaluar "Alcanzar Humedad" (Prioridad 2)
    decision_humedad = False
    # ------------------------------------------------------------------
    delta_emc_min = config.delta_emc_min if config.delta_emc_min is not None else 0.0
    if config and config.achieve_humidity:
        print(f"[DEBUG _evaluate_intelligent_mode] AchieveHumidity=True, target_emc={config.target_emc}")
        temp_values = _extract_temp_values(latest_temperatures)
        if not temp_values or not grain_type:
            current_app.logger.warning(f"Silo {silo.id} [Hum]: Faltan temperaturas o tipo de grano para evaluar.")
        else:
            temp_promedio_interna = sum(temp_values) / len(temp_values)
            print(f"[DEBUG _evaluate_intelligent_mode] Temp_promedio_interna={temp_promedio_interna:.2f}°C vs temp_externa={temp_externa:.2f}°C")
            target_emc_cfg = config.target_emc if config.target_emc is not None else 0.0
            erh_objetivo = _get_equilibrium_humidity(grain_type, target_emc_cfg, temp_promedio_interna)

            if erh_objetivo is None:
                current_app.logger.warning(f"Silo {silo.id} [Hum]: No se pudo calcular ERH objetivo (valores fuera de tabla).")
            else:
                # Solo airear si la humedad externa es menor que la de equilibrio (menos una histéresis)
                histeresis_humedad = 2 # Pequeño margen para evitar ciclos cortos
                aire_seca = hum_externa < (erh_objetivo - histeresis_humedad)
                decision_humedad = aire_seca
                current_app.logger.debug(
                    f"Silo {silo.id} [Hum]: Decisión={decision_humedad}. "
                    f"H_ext={hum_externa:.1f}, ERH_obj={erh_objetivo:.1f}, T_prom={temp_promedio_interna:.1f}, delta_emc_min={delta_emc_min}"
                )

    # 4. Decisión Final
    print(f"[DEBUG _evaluate_intelligent_mode] decision_humedad={decision_humedad}")
    return decision_humedad


def _get_silo_operation_forecast(silo, weather_data_list, grain_type=None):
    """
    Determina las horas en las que es seguro operar un silo específico basado
    en el pronóstico meteorológico y las restricciones del silo.
    Esta función NO consulta la base de datos para el silo ni para el clima,
    los recibe como parámetros.

    Args:
        silo (Silo): El objeto Silo a evaluar.
        weather_data_list (list): Lista de diccionarios con el pronóstico meteorológico
                                  horario para el establecimiento.
                                  Cada dict debe tener 'hour', 'temperature', 
                                  'humidity', 'precipitation_amount'.
        grain_type (str, optional): El tipo de grano en el silo ('trigo', 'soja', 'maiz').
                                    Necesario para el modo 'intelligent'.

    Returns:
        list: Una lista de diccionarios, cada uno representando una hora del pronóstico.
              Cada diccionario contiene:
              - 'hour': La hora del pronóstico (string, ej: '2023-10-27 14:00').
              - 'safe_to_operate': Booleano indicando si es seguro operar.
              - 'conditions': (Opcional, si se quiere mantener el detalle como en get_silo_operation_hours)
                              Un diccionario con el detalle de cada condición evaluada.
    """
    if not silo or not weather_data_list:
        # Devuelve un pronóstico 'no seguro' para todas las horas si faltan datos.
        # La longitud del pronóstico se basará en weather_data_list si existe, o vacío.
        return [{'hour': wd.get('hour', 'unknown'), 'safe_to_operate': False} for wd in weather_data_list] if weather_data_list else []

    operation_forecast = []

    # Identificar índices de lluvia y ampliar una hora antes y después
    # Esta lógica es idéntica a la de get_silo_operation_hours y get_silos_operation_status
    rain_hours_idx = set()
    for idx, hour_data in enumerate(weather_data_list):
        if hour_data.get('precipitation_amount', 0) > 0:
            rain_hours_idx.add(idx)
            if idx > 0:
                rain_hours_idx.add(idx - 1)
            if idx < len(weather_data_list) - 1:
                rain_hours_idx.add(idx + 1)

    for idx, hour_data in enumerate(weather_data_list):
        forecast_time_str = hour_data.get('hour')
        if not forecast_time_str:
            # Si una hora no tiene 'hour', no se puede procesar, marcar como no seguro.
            operation_forecast.append({'hour': 'unknown', 'safe_to_operate': False})
            continue
            
        try:
            # forecast_time_str es una string como "2025-06-17 15:00" (YA ES LOCAL GMT-3)
            # No necesitamos convertirla, solo extraer la hora.
            local_forecast_time_naive = datetime.strptime(forecast_time_str, '%Y-%m-%d %H:00')
            current_hour_of_day = local_forecast_time_naive.hour # Esto dará la hora correcta (ej. 15)
            
            # Guardamos el objeto datetime completo por si se necesita más adelante,
            # ya que es la hora local correcta del pronóstico.
            # Lo hacemos "aware" de su zona horaria para evitar confusiones.
            gmt3_tz = pytz.timezone('America/Argentina/Buenos_Aires')
            forecast_time_gmt3 = gmt3_tz.localize(local_forecast_time_naive)
        except ValueError:
            # Si el formato de la hora es incorrecto, marcar como no seguro.
            operation_forecast.append({'hour': forecast_time_str, 'safe_to_operate': False})
            continue

        temp_val = hour_data.get('temperature')
        humidity_val = hour_data.get('humidity')

        if temp_val is None or humidity_val is None:
            # Si faltan datos de temperatura o humedad, marcar como no seguro.
            operation_forecast.append({'hour': forecast_time_str, 'safe_to_operate': False})
            continue

        # 1. Evaluar Condiciones de Seguridad Universales
        no_rain = idx not in rain_hours_idx
        no_fog = not has_fog_or_mist(hour_data)
        
        peak_hours_active = 17 <= current_hour_of_day < 23
        peak_hours_ok = not (silo.peak_hours_shutdown and peak_hours_active)
        
        # Verificar restricción de aireación (horario manual o solar)
        air_time_ok = True
        
        if silo.use_sun_schedule:
            # Usar horario basado en horas de sol
            sun_hours = get_sun_hours(silo.establishment.latitude, silo.establishment.longitude)
            sunrise_hour = sun_hours['sunrise_hour']
            sunset_hour = sun_hours['sunset_hour']
            
            # Verificar si está dentro del horario solar
            if sunrise_hour <= sunset_hour:
                # Horario normal (no cruza medianoche)
                sun_time_ok = sunrise_hour <= current_hour_of_day < sunset_hour
            else:
                # Horario que cruza medianoche (caso raro pero posible)
                sun_time_ok = current_hour_of_day >= sunrise_hour or current_hour_of_day < sunset_hour
            
            # Verificar si está nublado
            cloudy_weather = is_cloudy_weather(hour_data)
            
            # Solo operar si está dentro del horario solar Y no está nublado
            air_time_ok = sun_time_ok and not cloudy_weather
            
        else:
            # Usar horario manual tradicional
            air_start_hour = silo.air_start_hour
            air_end_hour = silo.air_end_hour
            
            # Solo aplicar restricción si no es el rango completo (0-23)
            if air_start_hour == 0 and air_end_hour == 23:
                air_time_ok = True
            else:
                if air_start_hour < air_end_hour:
                    # Rango normal (ej: 8-17)
                    air_time_ok = air_start_hour <= current_hour_of_day < air_end_hour
                else:
                    # Rango que cruza medianoche (ej: 22-6)
                    air_time_ok = current_hour_of_day >= air_start_hour or current_hour_of_day < air_end_hour
        
        universal_safety_ok = no_rain and no_fog and peak_hours_ok and air_time_ok

        # 2. Lógica de Decisión por Modo
        final_safe_to_operate = False  # Por defecto, no operar

        if silo.manual_mode == 'on':
            final_safe_to_operate = universal_safety_ok
        elif silo.manual_mode == 'off':
            final_safe_to_operate = False
        elif universal_safety_ok:
            # Para 'auto' e 'ia' (intelligent), solo proceder si se cumplen condiciones universales.
            if silo.manual_mode == 'auto':
                temp_ok = silo.min_temperature <= temp_val <= silo.max_temperature
                humidity_ok = silo.min_humidity <= humidity_val <= silo.max_humidity
                final_safe_to_operate = temp_ok and humidity_ok
            elif silo.manual_mode == 'ia' or silo.manual_mode == 'intelligent':
                # La lógica inteligente ahora es independiente de los umbrales de 'auto'.
                final_safe_to_operate = _evaluate_intelligent_mode(silo, grain_type, hour_data)


        operation_forecast.append({
            'hour': forecast_time_str,
            'safe_to_operate': final_safe_to_operate
            # Podrías añadir el diccionario 'conditions' aquí si lo necesitas para depuración o logs
        })
        
    return operation_forecast

# ... (resto del archivo app.py) ...

def get_silo_operation_hours(silo_id):
    """
    Determina las horas en las que es seguro operar un silo basado en el pronóstico meteorológico
    y las restricciones del silo.
    
    Args:
        silo_id: ID del silo a evaluar
        
    Returns:
        Lista de diccionarios con la hora y si es seguro operar en ese momento
    """
    # Obtener el silo y su establecimiento asociado
    silo = db.session.get(Silo, silo_id)
    if not silo:
        return None
        
    # Obtener datos meteorológicos del establecimiento
    weather_data_original = get_weather_data(silo.establishment) # Renombrado para claridad
    if not weather_data_original:
        return None # o jsonify({'error': 'Datos meteorológicos no disponibles'}), 500

    # Filtrar weather_data para que comience desde la hora actual (GMT-3)
    gmt3_tz = pytz.timezone('America/Argentina/Buenos_Aires')
    utc_tz = pytz.utc
    
    # Calcular current_time_gmt3 de forma robusta
    current_utc_time_for_filter = datetime.now(utc_tz)
    current_gmt3_time_for_filter_ref = current_utc_time_for_filter.astimezone(gmt3_tz)
    current_time_gmt3 = current_gmt3_time_for_filter_ref.replace(minute=0, second=0, microsecond=0)
    # print(f"[get_silo_operation_hours DBG] current_time_gmt3 for filtering: {current_time_gmt3}")

    weather_data_filtered = []
    for wd in weather_data_original:
        try:
            # wd['hour'] es una string local GMT-3, ej: "2023-10-27 15:00"
            forecast_time_local_naive = datetime.strptime(wd['hour'], '%Y-%m-%d %H:00')
            # Hacemos "aware" esta hora local para compararla correctamente
            forecast_time_gmt3_aware = gmt3_tz.localize(forecast_time_local_naive)
            
            if forecast_time_gmt3_aware >= current_time_gmt3:
                weather_data_filtered.append(wd)
        except (ValueError, KeyError) as e:
            # print(f"Error procesando hora del pronóstico para filtro: {wd.get('hour')}, error: {e}")
            continue
    
    weather_data = weather_data_filtered # Usar la lista filtrada

    if not weather_data: # Si después de filtrar no quedan datos
        return []

    operation_hours = []
    
    # Identificar índices de lluvia y ampliar una hora antes y después (opera sobre la lista filtrada)
    rain_hours_idx = set()
    for idx, hour_data in enumerate(weather_data):
        if hour_data.get('precipitation_amount', 0) > 0:
            rain_hours_idx.add(idx)
            if idx > 0:
                rain_hours_idx.add(idx - 1)
            if idx < len(weather_data) - 1:
                rain_hours_idx.add(idx + 1)

    for idx, hour_data in enumerate(weather_data):
        # hour_data['hour'] es una string local GMT-3, ej: "2023-10-27 15:00"
        # Parsearla directamente para obtener la hora local.
        local_forecast_time_naive = datetime.strptime(hour_data['hour'], '%Y-%m-%d %H:00')
        hour = local_forecast_time_naive.hour # Usar hora local para condiciones de silo
        # forecast_time_obj_gmt3 (aware) podría ser útil si se necesita el objeto datetime completo más adelante
        # forecast_time_obj_gmt3 = gmt3_tz.localize(local_forecast_time_naive)
        
        # Verificar condiciones meteorológicas
        temp_ok = silo.min_temperature <= hour_data['temperature'] <= silo.max_temperature
        humidity_ok = silo.min_humidity <= hour_data['humidity'] <= silo.max_humidity
        # Solo la lógica de lluvia se amplía
        no_rain = idx not in rain_hours_idx
        no_fog = not has_fog_or_mist(hour_data)
        
        # Verificar restricción de horas pico
        peak_hours = 17 <= hour <= 23
        peak_hours_ok = not (silo.peak_hours_shutdown and peak_hours)
        
        # Verificar restricción de aireación
        air_time_ok = True
        cloudy_weather = False
        
        if silo.use_sun_schedule:
            # Usar horario basado en horas de sol
            sun_hours = get_sun_hours(silo.establishment.latitude, silo.establishment.longitude)
            sunrise_hour = sun_hours['sunrise_hour']
            sunset_hour = sun_hours['sunset_hour']
            
            # Verificar si está dentro del horario solar
            if sunrise_hour <= sunset_hour:
                # Horario normal (no cruza medianoche)
                sun_time_ok = sunrise_hour <= hour < sunset_hour
            else:
                # Horario que cruza medianoche (caso raro pero posible)
                sun_time_ok = hour >= sunrise_hour or hour < sunset_hour
            
            # Verificar si está nublado
            cloudy_weather = is_cloudy_weather(hour_data)
            
            # Solo operar si está dentro del horario solar Y no está nublado
            air_time_ok = sun_time_ok and not cloudy_weather
            
        else:
            # Usar horario manual tradicional
            air_start_hour = silo.air_start_hour
            air_end_hour = silo.air_end_hour
            
            # Solo aplicar restricción si no es el rango completo (0-23)
            if air_start_hour == 0 and air_end_hour == 23:
                air_time_ok = True
            else:
                if air_start_hour < air_end_hour:
                    # Rango normal (ej: 8-17)
                    air_time_ok = air_start_hour <= hour < air_end_hour
                else:
                    # Rango que cruza medianoche (ej: 22-6)
                    air_time_ok = hour >= air_start_hour or hour < air_end_hour
        
        # Es seguro operar si todas las condiciones se cumplen
        safe_to_operate = temp_ok and humidity_ok and no_rain and no_fog and peak_hours_ok and air_time_ok

        # --- Lógica de modos ---
        if silo.manual_mode == 'ia':
            # Obtener tipo de cereal desde AerationConfig
            config = AerationConfig.query.filter_by(silo_id=silo.id).first()
            grain_type = config.tipo_cereal if config else None
            # Evaluar modo inteligente
            safe_ia = _evaluate_intelligent_mode(silo, grain_type, hour_data)
            # Restricciones adicionales: lluvia, niebla y horario
            # Lluvia o niebla: si hay lluvia o niebla, nunca operar
            # Horario: si está fuera de rango horario permitido, tampoco operar
            if not no_rain or not no_fog:
                safe_to_operate = False
            elif not air_time_ok:
                safe_to_operate = False
            else:
                safe_to_operate = safe_ia
        elif silo.manual_mode == 'on':
            safe_to_operate = True
            # Incluso en modo manual, respetar lluvia y niebla (restricciones de seguridad en modo manual ON)
            if not no_rain or not no_fog:
                safe_to_operate = False
            # En modo manual ON, ignoramos todas las demás restricciones (hora pico y rango horario)
        elif silo.manual_mode == 'off':
            safe_to_operate = False
        # Determinar el modo para el frontend
        if silo.manual_mode == 'ia':
            mode = 'intelligent'
        elif silo.manual_mode in ['on', 'off']:
            mode = 'manual'
        else:
            mode = 'auto'

        operation_status = {
            'hour': hour_data['hour'],
            'safe_to_operate': safe_to_operate,
            'conditions': {
                'temperature': {
                    'value': hour_data['temperature'],
                    'in_range': temp_ok,
                    'min': silo.min_temperature,
                    'max': silo.max_temperature
                },
                'humidity': {
                    'value': hour_data['humidity'],
                    'in_range': humidity_ok,
                    'min': silo.min_humidity,
                    'max': silo.max_humidity
                },
                'precipitation': {
                    'value': hour_data['precipitation_amount'],
                    'ok': no_rain
                },
                'peak_hours': {
                    'is_peak_hour': peak_hours,
                    'shutdown_enabled': silo.peak_hours_shutdown,
                    'ok': peak_hours_ok
                },
                'air_time': {
                    'start': silo.air_start_hour if not silo.use_sun_schedule else None,
                    'end': silo.air_end_hour if not silo.use_sun_schedule else None,
                    'use_sun_schedule': silo.use_sun_schedule,
                    'sun_hours': get_sun_hours(silo.establishment.latitude, silo.establishment.longitude) if silo.use_sun_schedule else None,
                    'cloudy': cloudy_weather,
                    'in_range': air_time_ok
                }
            },
            'mode': mode,
        }
        operation_hours.append(operation_status)
    return operation_hours

@app.route('/manage_sensors')
@login_required
def manage_sensors():
    """
    Página para gestionar los sensores de corriente.
    Accesible para super_admin y admin, pero con diferentes niveles de acceso.
    """
    if current_user.role not in ['super_admin', 'admin']:
        flash('Acceso no autorizado', 'danger')
        return redirect(url_for('index'))
    
    # Filtrar establecimientos según el rol del usuario
    if current_user.role == 'super_admin':
        # Super admin puede ver todos los establecimientos con sensores
        establishments_with_sensors = Establishment.query.filter(Establishment.current_sensor_id.isnot(None)).all()
        all_establishments = Establishment.query.all()
    else:
        # Admin regular solo puede ver sus establecimientos con sensores
        establishments_with_sensors = []
        for establishment in current_user.establishments:
            if establishment.current_sensor_id:
                establishments_with_sensors.append(establishment)
        all_establishments = current_user.establishments
    
    return render_template('manage_sensors.html', 
                          establishments=establishments_with_sensors,
                          all_establishments=all_establishments)

@app.route('/update_current_limit/<int:establishment_id>', methods=['POST'])
@login_required
def update_current_limit(establishment_id):
    """
    Actualiza el límite de corriente para un establecimiento.
    Super_admin puede modificar cualquier establecimiento.
    Admin regular solo puede modificar sus propios establecimientos.
    """
    if current_user.role not in ['super_admin', 'admin']:
        flash('Acceso no autorizado', 'danger')
        return redirect(url_for('index'))
    
    establishment = Establishment.query.get_or_404(establishment_id)
    
    # Verificar si el usuario tiene acceso a este establecimiento
    if current_user.role != 'super_admin' and not current_user.can_access_establishment(establishment_id):
        flash('No tienes permiso para modificar este establecimiento', 'danger')
        return redirect(url_for('manage_sensors'))
    
    try:
        max_current = request.form.get('max_current', '')
        if max_current:
            establishment.max_operating_current = float(max_current)
        else:
            establishment.max_operating_current = None
        
        db.session.commit()
        flash(f'Límite de corriente actualizado para {establishment.name}', 'success')
    except ValueError:
        flash('El valor ingresado no es válido', 'danger')
    
    return redirect(url_for('manage_sensors'))

@app.route('/assign_current_sensor', methods=['POST'])
@login_required
def assign_current_sensor():
    """
    Asigna un sensor de corriente a un establecimiento.
    Solo accesible para administradores.
    """
    if current_user.role not in ['super_admin', 'admin']:
        flash('Acceso no autorizado', 'danger')
        return redirect(url_for('index'))
    
    establishment_id = request.form.get('establishment_id')
    sensor_id = request.form.get('sensor_id')
    
    if not establishment_id or not sensor_id:
        flash('Faltan datos requeridos', 'danger')
        return redirect(url_for('manage_sensors'))
    
    establishment = Establishment.query.get_or_404(establishment_id)
    establishment.current_sensor_id = sensor_id
    
    db.session.commit()
    flash(f'Sensor {sensor_id} asignado a {establishment.name}', 'success')
    
    return redirect(url_for('manage_sensors'))

@app.route('/api/current_value/<sensor_id>')
@login_required
def get_current_value(sensor_id):
    """
    API para obtener el valor actual de corriente de un sensor específico.
    Super_admin puede acceder a cualquier sensor.
    Admin regular solo puede acceder a sensores de sus establecimientos.
    """
    if current_user.role not in ['super_admin', 'admin']:
        return jsonify({'status': 'error', 'mensaje': 'Acceso no autorizado'}), 403
    
    # Verificar si el usuario tiene acceso a este sensor
    if current_user.role != 'super_admin':
        # Buscar el establecimiento asociado a este sensor
        establishment = Establishment.query.filter_by(current_sensor_id=sensor_id).first()
        if not establishment or not current_user.can_access_establishment(establishment.id):
            return jsonify({'status': 'error', 'mensaje': 'No tienes permiso para acceder a este sensor'}), 403
    
    global device_current_values
    last_value = device_current_values.get(sensor_id)
    
    if last_value is not None:
        # Buscar el establecimiento asociado a este sensor para obtener el máximo de corriente
        establishment = Establishment.query.filter_by(current_sensor_id=sensor_id).first()
        max_current = None
        
        if establishment:
            max_current = establishment.max_operating_current
        
        return jsonify({
            'device_id': sensor_id, 
            'corriente': last_value,
            'max_corriente': max_current
        }), 200
    else:
        return jsonify({'status': 'error', 'mensaje': f'No se ha recibido ningún valor para el dispositivo {sensor_id}'}), 404

# ---------------------------------------------------------------------------
# Rutas para la gestión de Sensores de Temperatura (Solo Super Admin)
# ---------------------------------------------------------------------------

@app.route('/manage_temperature_sensors')
@login_required
@super_admin_required
def manage_temperature_sensors():
    sensores = SensorTemperatura.query.order_by(SensorTemperatura.id).all()
    return render_template('temperature_management/manage_temperature_sensors.html', sensores=sensores)

@app.route('/add_temperature_sensor', methods=['GET', 'POST'])
@login_required
@super_admin_required
def add_temperature_sensor():
    if request.method == 'POST':
        numero_serie = request.form.get('numero_serie')
        descripcion = request.form.get('descripcion')

        if not numero_serie:
            flash('El número de serie es obligatorio.', 'danger')
            return render_template('temperature_management/add_temperature_sensor.html', 
                                   numero_serie=numero_serie, descripcion=descripcion)

        existing_sensor = SensorTemperatura.query.filter_by(numero_serie=numero_serie).first()
        if existing_sensor:
            flash('Ya existe un sensor con ese número de serie.', 'danger')
            return render_template('temperature_management/add_temperature_sensor.html',
                                   numero_serie=numero_serie, descripcion=descripcion)
        
        try:
            nuevo_sensor = SensorTemperatura(numero_serie=numero_serie, descripcion=descripcion)
            db.session.add(nuevo_sensor)
            db.session.commit()
            flash('Sensor de temperatura añadido correctamente.', 'success')
            return redirect(url_for('manage_temperature_sensors'))
        except Exception as e:
            db.session.rollback()
            flash(f'Error al añadir el sensor: {str(e)}', 'danger')
            return render_template('temperature_management/add_temperature_sensor.html',
                                   numero_serie=numero_serie, descripcion=descripcion)

    return render_template('temperature_management/add_temperature_sensor.html')

@app.route('/edit_temperature_sensor/<int:sensor_id>', methods=['GET', 'POST'])
@login_required
@super_admin_required
def edit_temperature_sensor(sensor_id):
    sensor = db.session.get(SensorTemperatura, sensor_id)
    if not sensor:
        flash('Sensor de temperatura no encontrado.', 'danger')
        return redirect(url_for('manage_temperature_sensors'))

    # Para pasar al template en caso de error POST y repoblar
    numero_serie_intento = sensor.numero_serie 
    descripcion_intento = sensor.descripcion

    if request.method == 'POST':
        numero_serie_intento = request.form.get('numero_serie')
        descripcion_intento = request.form.get('descripcion')

        if not numero_serie_intento:
            flash('El número de serie es obligatorio.', 'danger')
            return render_template('temperature_management/edit_temperature_sensor.html', sensor=sensor, 
                                   numero_serie_intento=numero_serie_intento, descripcion_intento=descripcion_intento)

        if numero_serie_intento != sensor.numero_serie:
            existing_sensor = SensorTemperatura.query.filter_by(numero_serie=numero_serie_intento).first()
            if existing_sensor:
                flash('Ya existe otro sensor con ese número de serie.', 'danger')
                return render_template('temperature_management/edit_temperature_sensor.html', sensor=sensor, 
                                       numero_serie_intento=numero_serie_intento, descripcion_intento=descripcion_intento)
        
        try:
            sensor.numero_serie = numero_serie_intento
            sensor.descripcion = descripcion_intento
            db.session.commit()
            flash('Sensor de temperatura actualizado correctamente.', 'success')
            return redirect(url_for('manage_temperature_sensors'))
        except Exception as e:
            db.session.rollback()
            flash(f'Error al actualizar el sensor: {str(e)}', 'danger')
            return render_template('temperature_management/edit_temperature_sensor.html', sensor=sensor, 
                                   numero_serie_intento=numero_serie_intento, descripcion_intento=descripcion_intento)

    return render_template('temperature_management/edit_temperature_sensor.html', sensor=sensor,
                           numero_serie_intento=numero_serie_intento, descripcion_intento=descripcion_intento)

@app.route('/delete_temperature_sensor/<int:sensor_id>', methods=['POST'])
@login_required
@super_admin_required
def delete_temperature_sensor(sensor_id):
    sensor = db.session.get(SensorTemperatura, sensor_id)
    if not sensor:
        flash('Sensor de temperatura no encontrado.', 'danger')
        return redirect(url_for('manage_temperature_sensors'))

    barra_asignada = BarraSensores.query.filter(
        (BarraSensores.sensor1_id == sensor_id) |
        (BarraSensores.sensor2_id == sensor_id) |
        (BarraSensores.sensor3_id == sensor_id) |
        (BarraSensores.sensor4_id == sensor_id) |
        (BarraSensores.sensor5_id == sensor_id) |
        (BarraSensores.sensor6_id == sensor_id) |
        (BarraSensores.sensor7_id == sensor_id) |
        (BarraSensores.sensor8_id == sensor_id)
    ).first()

    if barra_asignada:
        flash(f'No se puede eliminar el sensor {sensor.numero_serie} porque está asignado a la barra "{barra_asignada.nombre}". Primero desasígnelo.', 'warning')
        return redirect(url_for('manage_temperature_sensors'))

    try:
        db.session.delete(sensor)
        db.session.commit()
        flash('Sensor de temperatura eliminado correctamente.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar el sensor: {str(e)}', 'danger')
    
    return redirect(url_for('manage_temperature_sensors'))

# y luego las rutas para BarraSensores.

# Helper function
def get_all_sensor_ids_assigned_in_any_bar(session):
    assigned_ids = set()
    all_bars_sensors_tuples = session.query(
        BarraSensores.sensor1_id, BarraSensores.sensor2_id, BarraSensores.sensor3_id, BarraSensores.sensor4_id,
        BarraSensores.sensor5_id, BarraSensores.sensor6_id, BarraSensores.sensor7_id, BarraSensores.sensor8_id
    ).all()
    
    for bar_sensor_tuple in all_bars_sensors_tuples:
        for sensor_id in bar_sensor_tuple:
            if sensor_id is not None:
                assigned_ids.add(sensor_id)
    return assigned_ids



# ---------------------------------------------------------------------------
# Rutas para la gestión de Barras de Sensores (Solo Super Admin)
# ---------------------------------------------------------------------------

@app.route('/manage_sensor_bars')
@login_required
@super_admin_required
def manage_sensor_bars():
    barras = BarraSensores.query.order_by(BarraSensores.nombre).all()
    return render_template('temperature_management/manage_sensor_bars.html', barras=barras)

@app.route('/add_sensor_bar', methods=['GET', 'POST'])
@login_required
@super_admin_required
def add_sensor_bar():
    # Sensores disponibles (no asignados a ninguna barra)
    assigned_sensor_ids = get_all_sensor_ids_assigned_in_any_bar(db.session)
    available_sensors = SensorTemperatura.query.filter(SensorTemperatura.id.notin_(assigned_sensor_ids)).order_by(SensorTemperatura.numero_serie).all()
    
    establishments = Establishment.query.order_by(Establishment.name).all()

    if request.method == 'POST':
        nombre = request.form.get('nombre')
        establishment_id_str = request.form.get('establishment_id')

        sensor_ids_from_form = []
        for i in range(1, 9):
            sensor_id_str = request.form.get(f'sensor{i}_id')
            if sensor_id_str:
                try:
                    sensor_ids_from_form.append(int(sensor_id_str))
                except ValueError:
                    flash(f'Valor inválido para Sensor Posición {i}.', 'danger')
                    return render_template('temperature_management/add_sensor_bar.html',
                                           establishments=establishments,
                                           available_sensors=available_sensors,
                                           request_form=request.form) # Para repoblar
            else:
                sensor_ids_from_form.append(None) # Mantener el orden con None para posiciones vacías

        # Validaciones
        if not nombre:
            flash('El nombre de la barra es obligatorio.', 'danger')
        
        # Validar unicidad del nombre
        if nombre and BarraSensores.query.filter_by(nombre=nombre).first():
            flash('Ya existe una barra de sensores con ese nombre.', 'danger')

        # Validar que al menos un sensor sea asignado
        assigned_count = sum(1 for sid in sensor_ids_from_form if sid is not None)
        if assigned_count == 0:
            flash('Debe asignar al menos un sensor a la barra.', 'danger')

        # Validar que no haya sensores duplicados en el formulario
        form_sensor_ids_no_none = [sid for sid in sensor_ids_from_form if sid is not None]
        if len(form_sensor_ids_no_none) != len(set(form_sensor_ids_no_none)):
            flash('No puede asignar el mismo sensor a múltiples posiciones en la misma barra.', 'danger')

        # Validar establecimiento si se proporcionó
        establecimiento_id = None
        if establishment_id_str:
            try:
                establecimiento_id = int(establishment_id_str)
                if not db.session.get(Establishment, establecimiento_id):
                    flash('Establecimiento seleccionado no válido.', 'danger')
                    establecimiento_id = None # Reset para evitar error al crear barra
            except ValueError:
                flash('ID de establecimiento no válido.', 'danger')

        # Si hay errores de flash, volver a renderizar el formulario
        if get_flashed_messages(category_filter=['danger']):
            return render_template('temperature_management/add_sensor_bar.html',
                                   establishments=establishments,
                                   available_sensors=available_sensors,
                                   # request.form se usa directamente en la plantilla para repoblar
                                   )

        try:
            nueva_barra = BarraSensores(
                nombre=nombre,
                establecimiento_id=establecimiento_id, # Puede ser None
                sensor1_id=sensor_ids_from_form[0],
                sensor2_id=sensor_ids_from_form[1],
                sensor3_id=sensor_ids_from_form[2],
                sensor4_id=sensor_ids_from_form[3],
                sensor5_id=sensor_ids_from_form[4],
                sensor6_id=sensor_ids_from_form[5],
                sensor7_id=sensor_ids_from_form[6],
                sensor8_id=sensor_ids_from_form[7]
            )
            db.session.add(nueva_barra)
            db.session.commit()
            flash('Barra de sensores añadida correctamente. Puede asignarla a un silo desde la lista.', 'success')
            return redirect(url_for('manage_sensor_bars'))
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error al añadir barra de sensores: {e}")
            flash(f'Error al añadir la barra de sensores: {str(e)}', 'danger')
            # No es necesario pasar request_form aquí, la plantilla lo usa directamente
            return render_template('temperature_management/add_sensor_bar.html', 
                                   establishments=establishments,
                                   available_sensors=available_sensors)

    # GET request
    return render_template('temperature_management/add_sensor_bar.html', 
                           establishments=establishments, 
                           available_sensors=available_sensors)

@app.route('/edit_sensor_bar/<int:bar_id>', methods=['GET', 'POST'])
@login_required
@super_admin_required
def edit_sensor_bar(bar_id):
    barra = db.session.get(BarraSensores, bar_id)
    if not barra:
        flash('Barra de sensores no encontrada.', 'danger')
        return redirect(url_for('manage_sensor_bars'))

    if request.method == 'POST':
        selected_sensor_ids_map = {} 
        processed_sensor_ids_in_form = [] 

        for i in range(1, 9): # Corresponds to sensor1_id ... sensor8_id
            slot_key_in_form = f'sensor{i}_id' # Name in the HTML form, e.g., 'sensor1_id'
            model_attr_name = f'sensor{i}_id' # Attribute name in BarraSensores model, e.g., 'sensor1_id'

            sensor_id_str = request.form.get(slot_key_in_form)
            
            if sensor_id_str and sensor_id_str.isdigit():
                sensor_id = int(sensor_id_str)
                selected_sensor_ids_map[model_attr_name] = sensor_id
                if sensor_id in processed_sensor_ids_in_form: 
                    sensor_details = db.session.get(SensorTemperatura, sensor_id)
                    sensor_info = f"ID {sensor_id}"
                    if sensor_details:
                        sensor_info = f"serie: {sensor_details.numero_serie} (ID: {sensor_id})"
                    flash(f'El sensor ({sensor_info}) ha sido seleccionado múltiples veces en este formulario. Cada sensor solo puede ocupar una posición.', 'danger')
                    return redirect(url_for('edit_sensor_bar', bar_id=bar_id))
                processed_sensor_ids_in_form.append(sensor_id)
            elif not sensor_id_str or sensor_id_str.strip() == "": 
                selected_sensor_ids_map[model_attr_name] = None # Empty selection means None
            else: 
                flash(f"Valor inválido '{sensor_id_str}' para sensor en posición {i}. Por favor, seleccione un sensor válido o deje el campo vacío.", "danger")
                return redirect(url_for('edit_sensor_bar', bar_id=bar_id))
        
        try:
            # Assign collected sensor IDs to the bar object
            for i in range(1, 9):
                model_attr_name = f'sensor{i}_id'
                setattr(barra, model_attr_name, selected_sensor_ids_map.get(model_attr_name))
            
            db.session.commit()
            flash('Asignaciones de sensores actualizadas correctamente.', 'success')
            return redirect(url_for('manage_sensor_bars'))
        except IntegrityError as e:
            db.session.rollback()
            current_app.logger.error(f"Error de integridad al editar barra {bar_id}: {e}")
            flash('Error de integridad: Uno o más sensores seleccionados ya están asignados en otra barra o posición. Por favor, revise las selecciones.', 'danger')
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error general al editar barra {bar_id}: {e}")
            flash(f'Error al actualizar la barra: {str(e)}', 'danger')
        
        return redirect(url_for('edit_sensor_bar', bar_id=bar_id))

    # --- Lógica para GET request ---
    current_bar_sensor_ids = []
    for i in range(1, 9):
        s_id = getattr(barra, f'sensor{i}_id') 
        if s_id:
            current_bar_sensor_ids.append(s_id)
    
    sensors_in_this_bar_dict = {s.id: s for s in SensorTemperatura.query.filter(SensorTemperatura.id.in_(current_bar_sensor_ids)).all()}

    other_bars_sensor_ids = set()
    other_bars = BarraSensores.query.filter(BarraSensores.id != bar_id).all()
    for ob in other_bars:
        for i in range(1, 9):
            s_id = getattr(ob, f'sensor{i}_id')
            if s_id:
                other_bars_sensor_ids.add(s_id)

    eligible_sensors = SensorTemperatura.query.filter(
        SensorTemperatura.id.notin_(list(other_bars_sensor_ids)) 
    ).order_by(SensorTemperatura.numero_serie).all()

    return render_template(
        'temperature_management/edit_sensor_bar_assignments.html',
        barra=barra,
        available_sensors=eligible_sensors, 
        sensors_in_this_bar=sensors_in_this_bar_dict
    )


@app.route('/assign_bar_to_silo/<int:bar_id>', methods=['GET', 'POST'])
@login_required
@super_admin_required
def assign_bar_to_silo_view(bar_id):
    barra = db.session.get(BarraSensores, bar_id)
    if not barra:
        flash('Barra de sensores no encontrada.', 'danger')
        return redirect(url_for('manage_sensor_bars'))

    if request.method == 'POST':
        silo_id_str = request.form.get('silo_id')
        if not silo_id_str or not silo_id_str.isdigit():
            flash('Debe seleccionar un silo válido.', 'danger')
            return redirect(url_for('assign_bar_to_silo_view', bar_id=bar_id))
        
        silo_id = int(silo_id_str)
        silo_to_assign = db.session.get(Silo, silo_id)

        if not silo_to_assign:
            flash('Silo seleccionado no encontrado.', 'danger')
            return redirect(url_for('assign_bar_to_silo_view', bar_id=bar_id))

        if silo_to_assign.barra_sensores_asociada and silo_to_assign.barra_sensores_asociada.id != barra.id:
            flash(f'El silo "{silo_to_assign.name}" ya tiene asignada la barra "{silo_to_assign.barra_sensores_asociada.nombre}". No se puede asignar.', 'danger')
            return redirect(url_for('assign_bar_to_silo_view', bar_id=bar_id))

        try:
            barra.silo_asignado = silo_to_assign
            
            if not barra.establecimiento_id or barra.establecimiento_id != silo_to_assign.establishment_id:
                barra.establecimiento_id = silo_to_assign.establishment_id
                flash(f'El establecimiento de la barra "{barra.nombre}" ha sido actualizado a "{silo_to_assign.establishment.name}" para coincidir con el silo.', 'info')

            db.session.commit()
            flash(f'Barra "{barra.nombre}" asignada correctamente al silo "{silo_to_assign.name}".', 'success')
            return redirect(url_for('manage_sensor_bars'))
        except IntegrityError as e: 
            db.session.rollback()
            current_app.logger.error(f"Error de integridad al asignar barra {barra.id} a silo {silo_id}: {e}")
            flash('Error de integridad al asignar la barra. Verifique que el silo no tenga otra barra o que la barra no esté ya asignada de forma conflictiva.', 'danger')
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error general al asignar barra {barra.id} a silo {silo_id}: {e}")
            flash(f'Ocurrió un error: {str(e)}', 'danger')
        
        return redirect(url_for('assign_bar_to_silo_view', bar_id=bar_id))

    # GET request:
    silos_disponibles_query = Silo.query.outerjoin(BarraSensores, Silo.id == BarraSensores.silo_asignado_id)\
                                     .filter(or_(BarraSensores.id == None, BarraSensores.id == bar_id)) # Silos libres O el silo actual de esta barra
    
    target_establecimiento_id = None
    if barra.establecimiento_id:
        target_establecimiento_id = barra.establecimiento_id
    elif barra.silo_asignado and barra.silo_asignado.establecimiento_id:
        target_establecimiento_id = barra.silo_asignado.establecimiento_id

    if target_establecimiento_id:
        silos_disponibles_query = silos_disponibles_query.filter(Silo.establishment_id == target_establecimiento_id)
    
    available_silos_list = silos_disponibles_query.order_by(Silo.establishment_id, Silo.name).all()
    
    # Asegurar que no haya duplicados si el silo actual ya estaba en la lista
    final_available_silos = []
    seen_silo_ids = set()
    for s in available_silos_list:
        if s.id not in seen_silo_ids:
            final_available_silos.append(s)
            seen_silo_ids.add(s.id)

    return render_template('temperature_management/assign_bar_to_silo.html',
                           barra=barra,
                           available_silos=final_available_silos)


@app.route('/deassign_bar_from_silo/<int:bar_id>', methods=['POST'])
@login_required
@super_admin_required
def deassign_bar_from_silo(bar_id):
    barra = db.session.get(BarraSensores, bar_id)
    if not barra:
        flash('Barra de sensores no encontrada.', 'danger')
        return redirect(url_for('manage_sensor_bars'))

    if not barra.silo_asignado:
        flash(f'La barra "{barra.nombre}" no está asignada a ningún silo.', 'info')
        return redirect(url_for('manage_sensor_bars')) 

    silo_original_nombre = barra.silo_asignado.name
    try:
        barra.silo_asignado_id = None
        db.session.commit()
        flash(f'Barra "{barra.nombre}" desasignada correctamente del silo "{silo_original_nombre}".', 'success')
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error al desasignar barra {barra.id} de silo: {e}")
        flash(f'Error al desasignar la barra: {str(e)}', 'danger')

    return redirect(url_for('manage_sensor_bars'))


@app.route('/delete_sensor_bar/<int:bar_id>', methods=['POST'])
@login_required
@super_admin_required
def delete_sensor_bar(bar_id):
    bar = db.session.get(BarraSensores, bar_id)
    if not bar:
        flash('Barra de sensores no encontrada.', 'danger')
        return redirect(url_for('manage_sensor_bars'))

    if bar.silo_asignado_id:
        flash(f'No se puede eliminar la barra "{bar.nombre}" porque está asignada al silo "{bar.silo_asignado.name if bar.silo_asignado else "Desconocido"}". Primero desasígnela.', 'warning')
        return redirect(url_for('manage_sensor_bars'))

    try:
        db.session.delete(bar)
        db.session.commit()
        flash(f'Barra de sensores "{bar.nombre}" eliminada correctamente.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al eliminar la barra: {str(e)}', 'danger')
    
    return redirect(url_for('manage_sensor_bars'))



@app.route('/assign_bar_to_silo_action/<int:bar_id>', methods=['POST'])
@login_required
@super_admin_required
def assign_bar_to_silo_action(bar_id):
    bar = db.session.get(BarraSensores, bar_id)
    if not bar:
        flash('Barra de sensores no encontrada.', 'danger')
        return redirect(url_for('manage_sensor_bars'))

    silo_id_str = request.form.get('silo_id')
    if not silo_id_str or not silo_id_str.isdigit():
        flash('ID de Silo no válido.', 'danger')
        return redirect(url_for('assign_bar_to_silo_view', bar_id=bar.id))
    
    silo_id = int(silo_id_str)
    silo_to_assign = db.session.get(Silo, silo_id)

    if not silo_to_assign:
        flash('Silo no encontrado.', 'danger')
        return redirect(url_for('assign_bar_to_silo_view', bar_id=bar.id))

    if not silo_to_assign.establishment_id:
        flash(f'El silo "{silo_to_assign.name}" no tiene un establecimiento asociado. No se puede asignar la barra.', 'danger')
        return redirect(url_for('assign_bar_to_silo_view', bar_id=bar.id))

    existing_bar_for_silo = BarraSensores.query.filter(BarraSensores.silo_asignado_id == silo_id, BarraSensores.id != bar.id).first()
    if existing_bar_for_silo:
        flash(f'El silo "{silo_to_assign.name}" ya está asignado a la barra "{existing_bar_for_silo.nombre}".', 'danger')
        return redirect(url_for('assign_bar_to_silo_view', bar_id=bar.id))
        
    if bar.silo_asignado_id and bar.silo_asignado_id != silo_id:
        flash(f'La barra "{bar.nombre}" ya está asignada al silo "{bar.silo_asignado.name if bar.silo_asignado else "Desconocido"}". Desasígnela primero.', 'warning')
        return redirect(url_for('assign_bar_to_silo_view', bar_id=bar.id))
    
    if bar.silo_asignado_id and bar.silo_asignado_id == silo_id:
        flash(f'La barra "{bar.nombre}" ya está asignada a este silo.', 'info')
        return redirect(url_for('manage_sensor_bars'))

    try:
        bar.silo_asignado_id = silo_to_assign.id
        bar.establecimiento_id = silo_to_assign.establishment_id
        # Las relaciones se actualizan automáticamente por SQLAlchemy al commitear las FKs

        db.session.commit()
        flash(f'Barra "{bar.nombre}" asignada correctamente al silo "{silo_to_assign.name}" (Est: {silo_to_assign.establishment.name}).', 'success')
    except IntegrityError:
        db.session.rollback()
        flash('Error de integridad al asignar la barra al silo. Es posible que el silo ya esté ocupado o la barra ya asignada.', 'danger')
    except Exception as e:
        db.session.rollback()
        flash(f'Error al asignar la barra al silo: {str(e)}', 'danger')
        
    return redirect(url_for('manage_sensor_bars'))

# TODO: Considerar una ruta para "desasignar" una barra de un silo.

# ---------------------------------------------------------------------------
# Configuración de modo inteligente de aireación
# ---------------------------------------------------------------------------
from flask import Blueprint
from sqlalchemy.orm.exc import NoResultFound

class AerationConfig(db.Model):
    __tablename__ = 'aeration_config'
    id = db.Column(db.Integer, primary_key=True)
    silo_id = db.Column(db.Integer, db.ForeignKey('silo.id'), unique=True, nullable=False)
    delta_temp_min = db.Column(db.Float, nullable=False, default=5.0)
    delta_temp_hyst = db.Column(db.Float, nullable=False, default=2.0)
    delta_emc_min = db.Column(db.Float, nullable=False, default=1.0)
    target_emc = db.Column(db.Float, nullable=False, default=14.0)
    min_on_time = db.Column(db.Integer, nullable=False, default=30)  # minutos
    min_off_time = db.Column(db.Integer, nullable=False, default=30) # minutos
    rain_protect = db.Column(db.Boolean, default=True)
    tipo_cereal = db.Column(db.String(20), nullable=False, default='maiz')
    target_temp = db.Column(db.Float, nullable=True) 
    achieve_humidity = db.Column(db.Boolean, default=False, nullable=False)
    achieve_temperature = db.Column(db.Boolean, default=False, nullable=False)

    active = db.Column(db.Boolean, nullable=False, default=False)
    
    silo = db.relationship('Silo', backref=db.backref('aeration_config', uselist=False))

@app.route('/silo/<int:silo_id>/intelligent-settings', methods=['GET', 'POST'])
@login_required
def intelligent_silo_settings(silo_id):
    silo = Silo.query.get_or_404(silo_id)
    # Verificar que el usuario tenga acceso al establecimiento del silo
    if not current_user.can_access_establishment(silo.establishment_id):
        flash('No tienes permiso para acceder a este silo.', 'danger')
        return redirect(url_for('user_silo_settings'))
    # AerationConfig: modelo a crear, uno por silo
    config = None
    try:
        config = AerationConfig.query.filter_by(silo_id=silo.id).one()
    except NoResultFound:
        config = None
    if request.method == 'POST':
        # Leer parámetros del formulario
        delta_temp_min = request.form.get('delta_temp_min', type=float)
        delta_temp_hyst = request.form.get('delta_temp_hyst', type=float)
        delta_emc_min = request.form.get('delta_emc_min', type=float)
        target_emc = request.form.get('target_emc', type=float)
        min_on_time = request.form.get('min_on_time', type=int)
        min_off_time = request.form.get('min_off_time', type=int)

        tipo_cereal = request.form.get('tipo_cereal')
        # Leer nuevos campos
        target_temp_form = request.form.get('target_temp', type=float)
        achieve_humidity_form = bool(request.form.get('achieve_humidity'))
        achieve_temperature_form = bool(request.form.get('achieve_temperature'))
        
        if config is None:
            config = AerationConfig(silo_id=silo.id)
            db.session.add(config)
        config.delta_temp_min = delta_temp_min
        config.delta_temp_hyst = delta_temp_hyst
        config.delta_emc_min = delta_emc_min
        config.target_emc = target_emc
        config.min_on_time = min_on_time
        config.min_off_time = min_off_time
        config.rain_protect = True
        config.tipo_cereal = tipo_cereal
        # Asignar nuevos campos
        config.target_temp = target_temp_form
        config.achieve_humidity = achieve_humidity_form
        config.achieve_temperature = achieve_temperature_form
        # Activar el modo inteligente
        config.active = True
        silo.manual_mode = 'ia'
        silo.modified = True

        db.session.commit()
        flash(f'Modo inteligente activado para el silo {silo.name}.', 'success')
        return redirect(url_for('user_silo_settings'))
    return render_template('intelligent_silo_settings.html', silo=silo, config=config or {})


# ---------------------------------------------------------------------------
# Endpoint para registrar lecturas de temperatura desde sensores (ESP32)
# ---------------------------------------------------------------------------

@app.route('/api/temperature_reading', methods=['POST'])
def api_temperature_reading():
    """
    Recibe datos de temperatura de un sensor y los almacena asociados a barra y silo.
    Espera JSON: {
        "numero_serie": "string",  # obligatorio
        "temperatura": float,       # obligatorio
        "timestamp": "YYYY-MM-DDTHH:MM:SS"  # opcional, default=now
    }
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({'status': 'error', 'message': 'No se recibió JSON válido.'}), 400

    numero_serie = data.get('numero_serie')
    temperatura = data.get('temperatura')
    timestamp_str = data.get('timestamp')

    if not numero_serie or temperatura is None:
        return jsonify({'status': 'error', 'message': 'Faltan campos obligatorios (numero_serie, temperatura).'}), 400

    sensor = SensorTemperatura.query.filter_by(numero_serie=numero_serie).first()
    if not sensor:
        return jsonify({'status': 'error', 'message': f'Sensor con numero_serie {numero_serie} no encontrado.'}), 404

    # Buscar la barra asociada a este sensor
    barra = BarraSensores.query.filter(
        (BarraSensores.sensor1_id == sensor.id) |
        (BarraSensores.sensor2_id == sensor.id) |
        (BarraSensores.sensor3_id == sensor.id) |
        (BarraSensores.sensor4_id == sensor.id) |
        (BarraSensores.sensor5_id == sensor.id) |
        (BarraSensores.sensor6_id == sensor.id) |
        (BarraSensores.sensor7_id == sensor.id) |
        (BarraSensores.sensor8_id == sensor.id)
    ).first()

    barra_id = barra.id if barra else None
    silo_id = barra.silo_asignado_id if barra and barra.silo_asignado_id else None

    # Parsear timestamp si viene, sino usar ahora
    if timestamp_str:
        try:
            timestamp = datetime.fromisoformat(timestamp_str)
            if timestamp.tzinfo is None:
                timestamp = pytz.timezone('America/Argentina/Buenos_Aires').localize(timestamp)
        except Exception:
            return jsonify({'status': 'error', 'message': 'Formato de timestamp inválido.'}), 400
    else:
        timestamp = datetime.now(pytz.timezone('America/Argentina/Buenos_Aires'))

    lectura = LecturaTemperatura(
        sensor_id=sensor.id,
        barra_id=barra_id,
        silo_id=silo_id,
        temperatura=temperatura,
        timestamp=timestamp,
        raw_payload=str(data)
    )
    db.session.add(lectura)
    db.session.commit()
    return jsonify({'status': 'ok', 'message': 'Lectura registrada', 'lectura_id': lectura.id}), 201

@app.route('/silo/<int:silo_id>/temperatures')
@login_required
def view_silo_temperatures(silo_id):
    from datetime import datetime, timedelta
    from sqlalchemy import func
    # 1. Obtener el silo y la barra asociada
    silo = Silo.query.get_or_404(silo_id)
    barra = getattr(silo, 'barra_sensores_asociada', None)
    sensores = []
    ultimas_lecturas = []
    lecturas_historicas = {}
    labels = []
    if barra:
        sensores = barra.get_ordered_sensors_with_data()
        # 2. Obtener la última lectura de cada sensor asignado
        for sensor in sensores:
            if sensor['sensor_id']:
                lectura = (
                    LecturaTemperatura.query
                    .filter_by(sensor_id=sensor['sensor_id'])
                    .order_by(LecturaTemperatura.timestamp.desc())
                    .first()
                )
                ultimas_lecturas.append({
                    'sensor': sensor,
                    'lectura': lectura
                })
            else:
                ultimas_lecturas.append({'sensor': sensor, 'lectura': None})
        # 3. Obtener y procesar lecturas para el mapa de calor (últimos 30 días)
        hace_30dias = datetime.now() - timedelta(days=30)
        heatmap_data = []
        sensor_labels = []

        for sensor_info in sensores:
            sensor_id = sensor_info['sensor_id']
            sensor_label = f"Sensor {sensor_info['position']}"
            sensor_labels.append(sensor_label)

            if sensor_id:
                lecturas = (
                    db.session.query(
                        func.date(LecturaTemperatura.timestamp).label('fecha'),
                        func.avg(LecturaTemperatura.temperatura).label('avg_temp')
                    )
                    .filter(
                        LecturaTemperatura.sensor_id == sensor_id,
                        LecturaTemperatura.timestamp >= hace_30dias
                    )
                    .group_by('fecha')
                    .order_by('fecha')
                    .all()
                )
                for lectura in lecturas:
                    heatmap_data.append({
                        'x': lectura.fecha.strftime('%Y-%m-%d'),
                        'y': sensor_label,
                        'v': round(lectura.avg_temp, 2)
                    })

    return render_template(
        'temperature_management/view_silo_temperatures.html',
        silo_id=silo_id,
        silo_nombre=silo.name,
        barra=barra,
        ultimas_lecturas=ultimas_lecturas,
        heatmap_data=heatmap_data,
        sensor_labels=sensor_labels
    )

@app.route('/sensors_overview')
@login_required
@super_admin_required
def sensors_overview():
    """
    Vista general de todos los sensores organizados por establecimiento y silo
    con sus últimas lecturas de temperatura.
    """
    try:
        # Obtener todos los establecimientos
        establecimientos = Establishment.query.all()
        
        # Estructura para organizar los datos
        datos_organizados = []
        
        for establecimiento in establecimientos:
            establecimiento_data = {
                'establecimiento': establecimiento,
                'silos': []
            }
            
            # Obtener silos del establecimiento que tienen barra de sensores
            silos_con_barra = []
            for silo in establecimiento.silos:
                if hasattr(silo, 'barra_sensores_asociada') and silo.barra_sensores_asociada:
                    silos_con_barra.append(silo)
            
            for silo in silos_con_barra:
                barra = silo.barra_sensores_asociada
                sensores_data = []
                
                # Obtener datos de cada sensor en la barra (posiciones 1-8)
                for i in range(1, 9):
                    sensor_obj = getattr(barra, f'sensor{i}')
                    sensor_id = getattr(barra, f'sensor{i}_id')
                    
                    if sensor_obj and sensor_id:
                        # Obtener la última lectura
                        ultima_lectura = LecturaTemperatura.query.filter_by(
                            sensor_id=sensor_id
                        ).order_by(desc(LecturaTemperatura.timestamp)).first()
                        
                        # Calcular tiempo desde la última lectura
                        tiempo_desde_lectura = None
                        estado_sensor = 'sin_datos'
                        
                        if ultima_lectura:
                            ahora = get_argentina_time()
                            if ultima_lectura.timestamp.tzinfo is None:
                                timestamp_lectura = ultima_lectura.timestamp.replace(
                                    tzinfo=pytz.timezone('America/Argentina/Buenos_Aires')
                                )
                            else:
                                timestamp_lectura = ultima_lectura.timestamp
                            
                            diferencia = ahora - timestamp_lectura
                            
                            # Determinar estado basado en tiempo transcurrido
                            if diferencia <= timedelta(minutes=30):
                                estado_sensor = 'activo'
                            elif diferencia <= timedelta(hours=2):
                                estado_sensor = 'reciente'
                            elif diferencia <= timedelta(days=1):
                                estado_sensor = 'antiguo'
                            else:
                                estado_sensor = 'muy_antiguo'
                            
                            # Formatear tiempo transcurrido
                            if diferencia.days > 0:
                                tiempo_desde_lectura = f"{diferencia.days} días"
                            elif diferencia.seconds > 3600:
                                horas = diferencia.seconds // 3600
                                tiempo_desde_lectura = f"{horas} horas"
                            else:
                                minutos = diferencia.seconds // 60
                                tiempo_desde_lectura = f"{minutos} minutos"
                        
                        sensores_data.append({
                            'posicion': i,
                            'sensor': sensor_obj,
                            'ultima_lectura': ultima_lectura,
                            'tiempo_desde_lectura': tiempo_desde_lectura,
                            'estado': estado_sensor
                        })
                    else:
                        # Posición vacía
                        sensores_data.append({
                            'posicion': i,
                            'sensor': None,
                            'ultima_lectura': None,
                            'tiempo_desde_lectura': None,
                            'estado': 'vacio'
                        })
                
                if sensores_data:  # Solo agregar si hay sensores
                    establecimiento_data['silos'].append({
                        'silo': silo,
                        'barra': barra,
                        'sensores': sensores_data
                    })
            
            # Solo agregar establecimiento si tiene silos con sensores
            if establecimiento_data['silos']:
                datos_organizados.append(establecimiento_data)
        
        # También obtener sensores que no están asignados a ninguna barra
        sensores_sin_asignar = []
        sensores_todos = SensorTemperatura.query.all()
        
        for sensor in sensores_todos:
            # Verificar si el sensor está asignado a alguna barra
            asignado = False
            for i in range(1, 9):
                if BarraSensores.query.filter(getattr(BarraSensores, f'sensor{i}_id') == sensor.id).first():
                    asignado = True
                    break
            
            if not asignado:
                # Obtener última lectura del sensor no asignado
                ultima_lectura = LecturaTemperatura.query.filter_by(
                    sensor_id=sensor.id
                ).order_by(desc(LecturaTemperatura.timestamp)).first()
                
                tiempo_desde_lectura = None
                estado_sensor = 'sin_datos'
                
                if ultima_lectura:
                    ahora = get_argentina_time()
                    if ultima_lectura.timestamp.tzinfo is None:
                        timestamp_lectura = ultima_lectura.timestamp.replace(
                            tzinfo=pytz.timezone('America/Argentina/Buenos_Aires')
                        )
                    else:
                        timestamp_lectura = ultima_lectura.timestamp
                    
                    diferencia = ahora - timestamp_lectura
                    
                    if diferencia <= timedelta(minutes=30):
                        estado_sensor = 'activo'
                    elif diferencia <= timedelta(hours=2):
                        estado_sensor = 'reciente'
                    elif diferencia <= timedelta(days=1):
                        estado_sensor = 'antiguo'
                    else:
                        estado_sensor = 'muy_antiguo'
                    
                    if diferencia.days > 0:
                        tiempo_desde_lectura = f"{diferencia.days} días"
                    elif diferencia.seconds > 3600:
                        horas = diferencia.seconds // 3600
                        tiempo_desde_lectura = f"{horas} horas"
                    else:
                        minutos = diferencia.seconds // 60
                        tiempo_desde_lectura = f"{minutos} minutos"
                
                sensores_sin_asignar.append({
                    'sensor': sensor,
                    'ultima_lectura': ultima_lectura,
                    'tiempo_desde_lectura': tiempo_desde_lectura,
                    'estado': estado_sensor
                })
        
        return render_template('temperature_management/sensors_overview.html',
                             datos_organizados=datos_organizados,
                             sensores_sin_asignar=sensores_sin_asignar,
                             total_establecimientos=len(datos_organizados),
                             total_sensores_sin_asignar=len(sensores_sin_asignar))
        
    except Exception as e:
        current_app.logger.error(f"Error en sensors_overview: {str(e)}")
        flash(f'Error al cargar vista general de sensores: {str(e)}', 'error')
        return redirect(url_for('index'))

@app.route('/api/sensors_with_data')
@login_required
@super_admin_required
def get_sensors_with_data():
    """
    Obtiene todos los sensores que tienen al menos una lectura de temperatura guardada
    junto con su última lectura.
    """
    try:
        # Consulta para obtener sensores con datos y su última lectura
        sensores_con_datos = db.session.query(
            SensorTemperatura.id,
            SensorTemperatura.numero_serie,
            SensorTemperatura.descripcion,
            func.max(LecturaTemperatura.timestamp).label('ultima_lectura_timestamp'),
            LecturaTemperatura.temperatura.label('ultima_temperatura')
        ).join(
            LecturaTemperatura, SensorTemperatura.id == LecturaTemperatura.sensor_id
        ).group_by(
            SensorTemperatura.id,
            SensorTemperatura.numero_serie,
            SensorTemperatura.descripcion
        ).all()
        
        # Para cada sensor, obtener la temperatura de la última lectura
        resultado = []
        for sensor_data in sensores_con_datos:
            # Obtener la lectura más reciente para obtener la temperatura exacta
            ultima_lectura = LecturaTemperatura.query.filter_by(
                sensor_id=sensor_data.id
            ).order_by(desc(LecturaTemperatura.timestamp)).first()
            
            if ultima_lectura:
                resultado.append({
                    'id': sensor_data.id,
                    'numero_serie': sensor_data.numero_serie,
                    'descripcion': sensor_data.descripcion or 'Sin descripción',
                    'ultima_temperatura': ultima_lectura.temperatura,
                    'ultima_lectura_timestamp': format_datetime(ultima_lectura.timestamp, '%Y-%m-%d %H:%M:%S'),
                    'total_lecturas': LecturaTemperatura.query.filter_by(sensor_id=sensor_data.id).count()
                })
        
        return jsonify({
            'status': 'success',
            'sensores': resultado,
            'total': len(resultado)
        })
        
    except Exception as e:
        current_app.logger.error(f"Error al obtener sensores con datos: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error al obtener los datos: {str(e)}'
        }), 500

@app.route('/heartbeat_history')
@login_required
@super_admin_required
def heartbeat_history():
    """Página para visualizar el historial de heartbeats de dispositivos ESP32"""
    try:
        # Obtener todos los establecimientos para el filtro
        establishments = Establishment.query.all()
        
        # Obtener el establecimiento seleccionado (por defecto el primero)
        selected_establishment_id = request.args.get('establishment_id', type=int)
        if not selected_establishment_id and establishments:
            selected_establishment_id = establishments[0].id
        
        # Obtener el rango de tiempo y fecha específica
        time_range = request.args.get('time_range', '24h')
        selected_date = request.args.get('selected_date', '')
        
        # Calcular fechas según el rango usando hora correcta de Argentina
        now = get_argentina_time()
        
        if time_range == '24h':
            # Últimas 24 horas desde ahora
            end_date = now
            start_date = now - timedelta(hours=24)
        else:  # specific_day
            if selected_date:
                try:
                    # Parsear la fecha seleccionada y convertir a timezone de Argentina
                    selected_dt = datetime.strptime(selected_date, '%Y-%m-%d')
                    argentina_tz = pytz.timezone('America/Argentina/Buenos_Aires')
                    selected_dt = argentina_tz.localize(selected_dt)
                    
                    start_date = selected_dt
                    end_date = selected_dt + timedelta(days=1) - timedelta(seconds=1)
                except ValueError:
                    # Si hay error en la fecha, usar últimas 24 horas
                    end_date = now
                    start_date = now - timedelta(hours=24)
            else:
                # Si no hay fecha seleccionada, usar últimas 24 horas
                end_date = now
                start_date = now - timedelta(hours=24)
            end_date = now
            interval_minutes = 20
        
        heartbeat_data = []
        devices = []
        
        if selected_establishment_id:
            # Obtener dispositivos del establecimiento seleccionado
            devices = Board.query.filter_by(establishment_id=selected_establishment_id).all()
            
            # Generar grilla de slots de tiempo fijos (3 slots por hora en 24 horas = 72 slots)
            time_slots = []
            current_time = start_date.replace(minute=0, second=0, microsecond=0)  # Empezar al inicio de la hora
            
            while current_time <= end_date:
                # Generar los 3 slots para esta hora
                slots = [
                    current_time.replace(minute=10),   # Slot 0-20 (representado en minuto 10)
                    current_time.replace(minute=30),   # Slot 21-40 (representado en minuto 30)
                    current_time.replace(minute=50)    # Slot 41-59 (representado en minuto 50)
                ]
                time_slots.extend(slots)
                current_time += timedelta(hours=1)
            
            # Obtener historial de heartbeats para estos dispositivos
            for device in devices:
                # Obtener registros de historial en el rango de tiempo, ordenados por timestamp
                history_records = DeviceHeartbeatHistory.query.filter(
                    DeviceHeartbeatHistory.mac_address == device.mac_address,
                    DeviceHeartbeatHistory.timestamp >= start_date,
                    DeviceHeartbeatHistory.timestamp <= end_date
                ).order_by(DeviceHeartbeatHistory.timestamp.asc()).all()
                
                # Crear diccionario de registros por timestamp para búsqueda rápida
                records_dict = {}
                for record in history_records:
                    if record.timestamp.tzinfo is None:
                        timestamp_tz = record.timestamp.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
                    else:
                        timestamp_tz = record.timestamp
                    records_dict[timestamp_tz] = record
                
                # Obtener estado actual del dispositivo
                current_heartbeat = DeviceHeartbeat.query.filter_by(mac_address=device.mac_address).first()
                current_status = 'offline'
                if current_heartbeat:
                    current_status = check_device_status(current_heartbeat.last_heartbeat)
                
                # Generar puntos para cada slot de tiempo
                points = []
                received_count = 0
                missing_count = 0
                
                for slot_time in time_slots:
                    # Buscar si hay un registro para este slot específico
                    found_record = None
                    for timestamp_tz, record in records_dict.items():
                        # Verificar si el registro está en el mismo slot
                        if (timestamp_tz.hour == slot_time.hour and 
                            abs(timestamp_tz.minute - slot_time.minute) <= 10):  # Tolerancia de ±10 min del centro del slot
                            found_record = record
                            break
                    
                    if found_record:
                        # Slot con datos (punto verde)
                        actual_time = found_record.timestamp
                        if actual_time.tzinfo is None:
                            actual_time = actual_time.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
                        
                        point_data = {
                            'timestamp': slot_time.isoformat(),
                            'timestamp_ms': int(slot_time.timestamp() * 1000),
                            'time': slot_time.strftime('%H:%M'),
                            'has_data': True,
                            'status': 'received',
                            'type': 'heartbeat',
                            'actual_time': actual_time.strftime('%H:%M'),
                            'slot_name': get_slot_name(slot_time.minute)
                        }
                        received_count += 1
                    else:
                        # Slot sin datos (punto rojo)
                        point_data = {
                            'timestamp': slot_time.isoformat(),
                            'timestamp_ms': int(slot_time.timestamp() * 1000),
                            'time': slot_time.strftime('%H:%M'),
                            'has_data': False,
                            'status': 'missing',
                            'type': 'missing',
                            'slot_name': get_slot_name(slot_time.minute)
                        }
                        missing_count += 1
                    
                    points.append(point_data)
                
                device_data = {
                    'mac_address': device.mac_address,
                    'current_status': current_status,
                    'history': points,
                    'total_slots': len(time_slots),
                    'received_slots': received_count,
                    'missing_slots': missing_count
                }
                
                heartbeat_data.append(device_data)
        
        # Obtener logs de acciones de aireadores para el mismo período
        action_logs = []
        if selected_establishment_id:
            # Obtener todos los dispositivos del establecimiento
            device_macs = [device.mac_address for device in devices]
            
            # Obtener logs de acciones en el rango de tiempo
            action_records = DeviceActionLog.query.filter(
                DeviceActionLog.mac_address.in_(device_macs),
                DeviceActionLog.timestamp >= start_date,
                DeviceActionLog.timestamp <= end_date
            ).order_by(DeviceActionLog.timestamp.desc()).all()
            
            for record in action_records:
                # Asegurar timezone correcto
                if record.timestamp.tzinfo is None:
                    timestamp_tz = record.timestamp.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
                else:
                    timestamp_tz = record.timestamp
                
                action_logs.append({
                    'mac_address': record.mac_address,
                    'timestamp': timestamp_tz.strftime('%Y-%m-%d %H:%M:%S'),
                    'action': record.action,
                    'result': record.result,
                    'message': record.message or '-',
                    'aerator_position': record.position
                })
        
        return render_template('heartbeat_history.html',
                             establishments=establishments,
                             selected_establishment_id=selected_establishment_id,
                             time_range=time_range,
                             selected_date=selected_date,
                             heartbeat_data=heartbeat_data,
                             action_logs=action_logs,
                             devices=devices,
                             start_date=start_date,
                             end_date=end_date)
                             
    except Exception as e:
        app.logger.error(f"Error en heartbeat_history: {str(e)}")
        flash(f'Error al cargar historial de heartbeats: {str(e)}', 'error')
        return redirect(url_for('index'))

@app.route('/api/heartbeat_history_data')
@login_required
@super_admin_required
def get_heartbeat_history_data():
    """API endpoint para obtener datos de historial de heartbeats en formato JSON"""
    try:
        establishment_id = request.args.get('establishment_id', type=int)
        time_range = request.args.get('time_range', '24h')
        
        if not establishment_id:
            return jsonify({'error': 'establishment_id requerido'}), 400
        
        # Calcular fechas según el rango usando hora correcta de Argentina
        now = get_argentina_time()
        if time_range == '24h':
            start_date = now - timedelta(hours=24)
        elif time_range == '7d':
            start_date = now - timedelta(days=7)
        else:
            start_date = now - timedelta(hours=24)
        
        # Obtener dispositivos del establecimiento
        devices = Board.query.filter_by(establishment_id=establishment_id).all()
        
        result = []
        for device in devices:
            # Obtener historial
            history_records = DeviceHeartbeatHistory.query.filter(
                DeviceHeartbeatHistory.mac_address == device.mac_address,
                DeviceHeartbeatHistory.timestamp >= start_date,
                DeviceHeartbeatHistory.timestamp <= now
            ).order_by(DeviceHeartbeatHistory.timestamp.asc()).all()
            
            # Obtener estado actual
            current_heartbeat = DeviceHeartbeat.query.filter_by(mac_address=device.mac_address).first()
            current_status = 'offline'
            if current_heartbeat:
                current_status = check_device_status(current_heartbeat.last_heartbeat)
            
            device_data = {
                'mac_address': device.mac_address,
                'current_status': current_status,
                'history': []
            }
            
            for record in history_records:
                if record.timestamp.tzinfo is None:
                    timestamp_tz = record.timestamp.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
                else:
                    timestamp_tz = record.timestamp
                
                device_data['history'].append({
                    'timestamp': timestamp_tz.isoformat(),
                    'timestamp_ms': int(timestamp_tz.timestamp() * 1000),
                    'status': 'online'
                })
            
            result.append(device_data)
        
        return jsonify({
            'status': 'success',
            'data': result,
            'time_range': time_range,
            'start_date': start_date.isoformat(),
            'end_date': now.isoformat()
        })
        
    except Exception as e:
        app.logger.error(f"Error en get_heartbeat_history_data: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/huevos/latest', methods=['GET'])
def get_latest_egg_data():
    """Endpoint para obtener los últimos registros de producción de huevos."""
    try:
        granja_id = request.args.get('granja_id', type=int)
        limit = request.args.get('limit', default=1, type=int)

        if limit is None or limit <= 0:
            return jsonify({'error': 'El parámetro limit debe ser un entero positivo'}), 400

        query = EggData.query
        if granja_id is not None:
            query = query.filter(EggData.granja_id == granja_id)

        records = query.order_by(desc(EggData.timestamp)).limit(limit).all()

        if not records:
            return jsonify({'status': 'success', 'data': [], 'message': 'No hay datos disponibles'}), 200

        def serialize(record):
            timestamp = record.timestamp
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))

            return {
                'id': record.id,
                'granja_id': record.granja_id,
                'timestamp': timestamp.isoformat(),
                'galpon_1': record.galpon_1,
                'galpon_2': record.galpon_2,
                'galpon_3': record.galpon_3,
                'galpon_4': record.galpon_4,
                'total': record.total,
                'created_at': record.created_at.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires')).isoformat() if record.created_at.tzinfo is None else record.created_at.isoformat()
            }

        data = [serialize(record) for record in records]

        return jsonify({'status': 'success', 'data': data}), 200

    except Exception as e:
        app.logger.error(f"Error en get_latest_egg_data: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@app.route('/api/mortalidad', methods=['POST'])
def receive_mortality_data():
    """Endpoint para recibir datos de mortalidad de gallinas."""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type debe ser application/json'}), 400

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos JSON válidos'}), 400

        required_fields = ['granja_id', 'galpon_1', 'galpon_2', 'galpon_3', 'galpon_4']
        missing_fields = [field for field in required_fields if field not in data]

        if missing_fields:
            return jsonify({'error': f'Campos faltantes: {missing_fields}'}), 400

        try:
            granja_id = int(data['granja_id'])
            galpon_1 = int(data['galpon_1'])
            galpon_2 = int(data['galpon_2'])
            galpon_3 = int(data['galpon_3'])
            galpon_4 = int(data['galpon_4'])
        except (ValueError, TypeError) as e:
            app.logger.warning(f"Error en tipos de datos de mortalidad: {str(e)}")
            return jsonify({'error': 'Los campos de mortalidad deben ser enteros válidos'}), 400

        if any(value < 0 for value in [galpon_1, galpon_2, galpon_3, galpon_4]):
            return jsonify({'error': 'Los valores de mortalidad no pueden ser negativos'}), 400

        total = data.get('total')
        if total is None:
            total = galpon_1 + galpon_2 + galpon_3 + galpon_4
        else:
            try:
                total = int(total)
            except (ValueError, TypeError) as e:
                app.logger.warning(f"Error en campo total de mortalidad: {str(e)}")
                return jsonify({'error': 'El campo total debe ser un entero válido'}), 400

            calculated_total = galpon_1 + galpon_2 + galpon_3 + galpon_4
            if total != calculated_total:
                return jsonify({'error': f'El total ({total}) no coincide con la suma de galpones ({calculated_total})'}), 400

        timestamp = data.get('timestamp')
        argentina_tz = pytz.timezone('America/Argentina/Buenos_Aires')

        if timestamp:
            try:
                parsed_timestamp = datetime.fromisoformat(str(timestamp).replace('Z', '+00:00'))
                if parsed_timestamp.tzinfo is None:
                    parsed_timestamp = parsed_timestamp.replace(tzinfo=argentina_tz)
                else:
                    parsed_timestamp = parsed_timestamp.astimezone(argentina_tz)
            except (ValueError, TypeError) as e:
                app.logger.warning(f"Error al parsear timestamp de mortalidad: {str(e)}")
                return jsonify({'error': 'Formato de timestamp inválido. Use formato ISO 8601'}), 400
        else:
            parsed_timestamp = datetime.now(argentina_tz)

        record = MortalityData(
            granja_id=granja_id,
            timestamp=parsed_timestamp,
            galpon_1=galpon_1,
            galpon_2=galpon_2,
            galpon_3=galpon_3,
            galpon_4=galpon_4,
            total=total
        )

        db.session.add(record)
        db.session.commit()

        app.logger.info(f"Datos de mortalidad guardados: granja_id={granja_id}, total={total}, timestamp={parsed_timestamp}")

        return jsonify({
            'status': 'success',
            'message': 'Datos de mortalidad recibidos y guardados correctamente',
            'id': record.id,
            'granja_id': granja_id,
            'total': total,
            'timestamp': parsed_timestamp.isoformat()
        }), 200

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error en receive_mortality_data: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500


@app.route('/api/huevos', methods=['POST'])
def receive_egg_data():
    """
    Endpoint para recibir datos de producción de huevos de granjas externas.
    
    Estructura JSON esperada:
    {
        "granja_id": 1,
        "timestamp": "2025-09-22T09:42:40.123456",
        "galpon_1": 1250,
        "galpon_2": 980,
        "galpon_3": 1100,
        "galpon_4": 890,
        "total": 4220
    }
    """
    try:
        # Verificar que el contenido sea JSON
        if not request.is_json:
            app.logger.warning("Solicitud recibida sin Content-Type: application/json")
            return jsonify({'error': 'Content-Type debe ser application/json'}), 400
        
        data = request.get_json()
        
        # Validar que se recibieron datos
        if not data:
            app.logger.warning("No se recibieron datos JSON válidos")
            return jsonify({'error': 'No se recibieron datos JSON válidos'}), 400
        
        # Validar campos requeridos
        required_fields = ['granja_id', 'timestamp', 'galpon_1', 'galpon_2', 'galpon_3', 'galpon_4', 'total']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            app.logger.warning(f"Campos faltantes: {missing_fields}")
            return jsonify({'error': f'Campos faltantes: {missing_fields}'}), 400
        
        # Validar tipos de datos
        try:
            granja_id = int(data['granja_id'])
            galpon_1 = int(data['galpon_1'])
            galpon_2 = int(data['galpon_2'])
            galpon_3 = int(data['galpon_3'])
            galpon_4 = int(data['galpon_4'])
            total = int(data['total'])
        except (ValueError, TypeError) as e:
            app.logger.warning(f"Error en tipos de datos numéricos: {str(e)}")
            return jsonify({'error': 'Los campos numéricos deben ser enteros válidos'}), 400
        
        # Validar y parsear timestamp
        try:
            # Intentar parsear el timestamp ISO
            timestamp_str = data['timestamp']
            if '.' in timestamp_str:
                # Con microsegundos
                timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            else:
                # Sin microsegundos
                timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            
            # Convertir a zona horaria de Argentina si es necesario
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
            else:
                timestamp = timestamp.astimezone(pytz.timezone('America/Argentina/Buenos_Aires'))
                
        except (ValueError, TypeError) as e:
            app.logger.warning(f"Error al parsear timestamp: {str(e)}")
            return jsonify({'error': 'Formato de timestamp inválido. Use formato ISO 8601'}), 400
        
        # Validar que el total coincida con la suma de galpones
        calculated_total = galpon_1 + galpon_2 + galpon_3 + galpon_4
        if total != calculated_total:
            app.logger.warning(f"Total inconsistente: recibido {total}, calculado {calculated_total}")
            return jsonify({'error': f'El total ({total}) no coincide con la suma de galpones ({calculated_total})'}), 400
        
        argentina_tz = pytz.timezone('America/Argentina/Buenos_Aires')
        local_timestamp = timestamp.astimezone(argentina_tz)
        record_date = local_timestamp.date()

        existing_record = EggData.query.filter(
            EggData.granja_id == granja_id,
            func.date(EggData.timestamp) == record_date
        ).first()

        if existing_record:
            existing_record.timestamp = timestamp
            existing_record.galpon_1 = galpon_1
            existing_record.galpon_2 = galpon_2
            existing_record.galpon_3 = galpon_3
            existing_record.galpon_4 = galpon_4
            existing_record.total = total
            db.session.commit()

            app.logger.info(f"Datos de huevos actualizados: granja_id={granja_id}, total={total}, fecha={record_date}")

            return jsonify({
                'status': 'success',
                'message': 'Datos de huevos actualizados para la fecha especificada',
                'id': existing_record.id,
                'granja_id': granja_id,
                'total': total,
                'timestamp': timestamp.isoformat()
            }), 200
        else:
            egg_record = EggData(
                granja_id=granja_id,
                timestamp=timestamp,
                galpon_1=galpon_1,
                galpon_2=galpon_2,
                galpon_3=galpon_3,
                galpon_4=galpon_4,
                total=total
            )

            db.session.add(egg_record)
            db.session.commit()

            app.logger.info(f"Datos de huevos guardados exitosamente: granja_id={granja_id}, total={total}, timestamp={timestamp}")

            return jsonify({
                'status': 'success',
                'message': 'Datos de huevos recibidos y guardados correctamente',
                'id': egg_record.id,
                'granja_id': granja_id,
                'total': total,
                'timestamp': timestamp.isoformat()
            }), 200
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error en receive_egg_data: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500

if __name__ == '__main__':
    init_db()
    app.run()  # Remove host and port, set debug=False for production
