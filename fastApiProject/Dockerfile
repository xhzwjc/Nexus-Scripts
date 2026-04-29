FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY . .

EXPOSE 8091

CMD ["gunicorn", "run:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", \
     "-b", "0.0.0.0:8091", "--access-logfile", "-", "--error-logfile", "-", \
     "--log-level", "info", "--capture-output"]