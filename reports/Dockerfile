FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the required dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY wait-for-it.sh /wait-for-it.sh

# Copy the rest of the application code into the container
COPY . .

RUN flask db init

RUN flask db revision --autogenerate -m "Create tables"

RUN flask db upgrade head

# Expose the port that the app runs on
EXPOSE 8000

# Run the application 
# gunicorn -w 4 -b 0.0.0.0:8000 app:app
CMD ["/wait-for-it.sh", "reports_db", "${POSTGRES_PORT}", "--", "gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "app:app"]
