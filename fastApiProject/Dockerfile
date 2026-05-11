FROM docker.1panel.live/library/python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on

WORKDIR /app

RUN sed -i 's|http://deb.debian.org|https://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir --use-deprecated=legacy-resolver -r requirements.txt --no-deps -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY . .

EXPOSE 8091

CMD ["sh", "-c", "python prestart.py && gunicorn run:app -w 4 -k uvicorn.workers.UvicornWorker \
     -b 0.0.0.0:8091 --access-logfile - --error-logfile - \
     --timeout 120 --graceful-timeout 30 \
     --log-level info --capture-output"]