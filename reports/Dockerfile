FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .


RUN pip install --no-cache-dir -r requirements.txt

COPY wait-for-it.sh /wait-for-it.sh

COPY . .

# RUN rm -rf migrations

# Run the application 
CMD ["./wait-for-it.sh", "reports_db", "${POSTGRES_PORT}", "--", "gunicorn", "-w", "4", "--threads", "2", "--worker-class", "gthread", "--worker-connections", "1000","--max-requests","1000", "--max-requests-jitter", "50", "--timeout", "120", "-b", "0.0.0.0:8000", "app:app"]
