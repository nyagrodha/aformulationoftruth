FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY monitor.py ./
COPY targets.txt ./

CMD ["python", "monitor.py"]
