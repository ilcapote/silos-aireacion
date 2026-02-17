import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'default_secret_key')
    DB_TYPE = os.getenv('DB_TYPE', 'local')

    if DB_TYPE == 'local':
        MYSQL_USER = os.environ.get('LOCAL_MYSQL_USER')
        MYSQL_PASSWORD = os.environ.get('LOCAL_MYSQL_PASSWORD')
        MYSQL_HOST = os.environ.get('LOCAL_MYSQL_HOST')
        MYSQL_DATABASE = os.environ.get('LOCAL_MYSQL_DATABASE')
    else:
        MYSQL_USER = os.environ.get('PA_MYSQL_USER')
        MYSQL_PASSWORD = os.environ.get('PA_MYSQL_PASSWORD')
        MYSQL_HOST = os.environ.get('PA_MYSQL_HOST')
        MYSQL_DATABASE = os.environ.get('PA_MYSQL_DATABASE')

    SQLALCHEMY_DATABASE_URI = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}/{MYSQL_DATABASE}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
