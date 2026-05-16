from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_version: str = "0.1.0"
    log_level: str = "info"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:5173"]

    jolpica_base_url: str = "https://api.jolpi.ca/ergast/f1"
    openf1_base_url: str = "https://api.openf1.org/v1"
    openf1_fallback_url: str = ""
    openmeteo_base_url: str = "https://api.open-meteo.com"

    admin_token: str = ""
    mongo_connection_string: str = ""
    openf1_db_name: str = "openf1-livetiming"

    cache_ttl_schedule: int = 3600
    cache_ttl_next_session: int = 60
    cache_ttl_standings: int = 1800
    cache_ttl_results: int = 3600
    cache_ttl_weather: int = 7200
    cache_ttl_news: int = 900

    model_config = {"env_prefix": "GRIDWATCH_"}


settings = Settings()
