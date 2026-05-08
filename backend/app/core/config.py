import os


class Settings:
    @property
    def frontend_origins(self) -> list[str]:
        raw_origins = os.getenv(
            "FRONTEND_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        )
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


settings = Settings()
