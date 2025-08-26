from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, relationship
import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    org_id = Column(Integer, ForeignKey("orgs.id"))
    api_keys = relationship("APIKey", back_populates="user")

class Org(Base):
    __tablename__ = "orgs"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    users = relationship("User", back_populates="org")

class APIKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    quota = Column(Integer, default=1000)
    user = relationship("User", back_populates="api_keys")

class Check(Base):
    __tablename__ = "checks"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    prefix = Column(String(5))
    # Não guardar password/suffix

class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True)
    email = Column(String, nullable=False)
    domain = Column(String, nullable=True)
    threshold = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
