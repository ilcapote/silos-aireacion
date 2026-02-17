from datetime import datetime
import pytz

def format_datetime(dt, format='%Y-%m-%d %H:%M:%S'):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=pytz.timezone('America/Argentina/Buenos_Aires'))
    return dt.strftime(format)

def standardize_mac(mac):
    return mac.upper()
