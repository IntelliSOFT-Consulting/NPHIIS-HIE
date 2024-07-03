from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os
from dotenv import load_dotenv
from flask_migrate import Migrate

load_dotenv()


app = Flask(__name__)

user = os.getenv("POSTGRES_USER")
password = os.getenv("POSTGRES_PASSWORD")
server = os.getenv("POSTGRES_SERVER")
port = os.getenv("POSTGRES_PORT")
database = os.getenv("POSTGRES_DB")


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = True
    SQLALCHEMY_DATABASE_URI = (
        f"postgresql://{user}:{password}@{server}:{port}/{database}"
    )


app.config.from_object(Config)

db = SQLAlchemy(app)
migrate = Migrate(app, db)
