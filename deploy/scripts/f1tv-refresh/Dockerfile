FROM python:3.12-slim
RUN pip install --no-cache-dir playwright kubernetes && \
    playwright install --with-deps chromium
