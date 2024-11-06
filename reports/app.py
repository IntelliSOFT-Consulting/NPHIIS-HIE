import atexit
import logging
from datetime import datetime, timedelta
import traceback
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED
from flask import jsonify, request
from flask_cors import CORS
from typing import Any
from hive import ImmunizationDataProcessor
import pg
from configs import app, db
from reports.moh_525_report import moh_525_report
from reports.moh_710_report import generate_moh_710_section_a
from reports.monitoring_report import monitoring_report
from models import *

# Configure logging
logging.basicConfig(level=logging.INFO)
scheduler_logger = logging.getLogger("scheduler")
app_logger = logging.getLogger("app")

CORS(app)


def job_listener(event):
    """Handle scheduler job events"""
    if event.exception:
        scheduler_logger.error(f"Job failed: {event.job_id}")
        scheduler_logger.error(f"Exception: {event.exception}")
        scheduler_logger.error(f"Traceback: {event.traceback}")
    else:
        scheduler_logger.info(f"Job completed successfully: {event.job_id}")
        scheduler_logger.info(f"Result: {event.retval}")


def initialize_scheduler():
    """Initialize and configure the scheduler"""
    try:
        scheduler = BackgroundScheduler()

        # Add event listeners
        scheduler.add_listener(job_listener, EVENT_JOB_ERROR | EVENT_JOB_EXECUTED)

        # Configure scheduler settings
        scheduler.configure(
            {
                "apscheduler.timezone": "UTC",
                "apscheduler.job_defaults.coalesce": True,
                "apscheduler.job_defaults.max_instances": 1,
                "apscheduler.job_defaults.misfire_grace_time": 15 * 60,
            }
        )

        def sync_data_job():
            """Synchronize data from Hive to PostgreSQL"""
            job_start_time = datetime.now()
            scheduler_logger.info(f"Starting data sync job at {job_start_time}")

            try:
                with app.app_context():
                    processor = ImmunizationDataProcessor()
                    result = processor.process_data()

                    job_end_time = datetime.now()
                    duration = (job_end_time - job_start_time).total_seconds()
                    scheduler_logger.info(
                        f"Data sync completed in {duration:.2f} seconds"
                    )
                    scheduler_logger.info(f"Sync results: {result}")

                    return {
                        "status": "success",
                        "duration": duration,
                        "timestamp": job_end_time.isoformat(),
                        "result": result,
                    }
            except Exception as e:
                scheduler_logger.error(f"Error in data sync job: {str(e)}")
                scheduler_logger.error(traceback.format_exc())
                return {
                    "status": "error",
                    "error": str(e),
                    "timestamp": datetime.now().isoformat(),
                }

        def cleanup_job():
            """Clean up old or invalid records"""
            try:
                with app.app_context():
                    result = pg.clean_database()
                    scheduler_logger.info(f"Cleanup completed: {result}")
                    return {
                        "status": "success",
                        "result": result,
                        "timestamp": datetime.now().isoformat(),
                    }
            except Exception as e:
                scheduler_logger.error(f"Error in cleanup job: {str(e)}")
                return {
                    "status": "error",
                    "error": str(e),
                    "timestamp": datetime.now().isoformat(),
                }

        # Add jobs to scheduler
        scheduler.add_job(
            func=sync_data_job,
            trigger=IntervalTrigger(minutes=30),
            id="data_sync_job",
            name="Sync data from Hive every 30 minutes",
            replace_existing=True,
            next_run_time=datetime.now(),
        )

        scheduler.add_job(
            func=cleanup_job,
            trigger="cron",
            hour=1,
            id="cleanup_job",
            name="Daily database cleanup",
            replace_existing=True,
        )

        scheduler.start()
        scheduler_logger.info("Scheduler started successfully")

        return scheduler

    except Exception as e:
        scheduler_logger.error(f"Error initializing scheduler: {str(e)}")
        scheduler_logger.error(traceback.format_exc())
        raise


def create_response(data: Any, status: int = 200) -> tuple:
    """Create standardized API response"""
    response = data if status == 200 else "Error"
    return jsonify(response), status


def handle_error(e: Exception, status: int = 500) -> tuple:
    """Handle API errors"""
    error_response = {
        "status": "error",
        "message": str(e),
        "timestamp": datetime.now().isoformat(),
        "traceback": traceback.format_exc() if app.debug else None,
    }
    return jsonify(error_response), status


@app.route("/api/analytics", methods=["POST"])
def analytics():
    """Process immunization data analytics"""
    try:
        processor = ImmunizationDataProcessor()
        response = processor.process_data()
        return create_response(response)
    except Exception as e:
        return handle_error(e)


@app.route("/api/defaulters", methods=["GET"])
def defaulters():
    """Query defaulters with filters"""
    try:
        name = request.args.get("name", "")
        facility = request.args.get("facility", "")
        vaccine_name = request.args.get("vaccine_name", "")
        start_date = request.args.get("start_date", "")
        end_date = request.args.get("end_date", "")
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 20))

        if page < 1 or per_page < 1:
            raise ValueError("Invalid pagination parameters")

        result = pg.query_defaulters(
            name=name,
            facility=facility,
            vaccine_name=vaccine_name,
            start_date=start_date,
            end_date=end_date,
            page=page,
            per_page=per_page,
        )
        return create_response(result)
    except ValueError as e:
        return handle_error(e, 400)
    except Exception as e:
        return handle_error(e)


@app.route("/api/moh_710_report", methods=["GET"])
def moh_710_report_endpoint():
    """Generate MOH 710 report"""
    try:
        default_start = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        default_end = datetime.now().strftime("%Y-%m-%d")

        filters = {
            "facility": request.args.get("facility", ""),
            "ward": request.args.get("ward", ""),
            "county": request.args.get("county", ""),
            "subcounty": request.args.get("subcounty", ""),
            "country": request.args.get("country", ""),
            "start_date": request.args.get("start_date", default_start),
            "end_date": request.args.get("end_date", default_end),
        }

        result = generate_moh_710_section_a(filters)
        return create_response(result)
    except Exception as e:
        return handle_error(e)


@app.route("/api/moh_525_report", methods=["GET"])
def moh_525_report_endpoint():
    """Generate MOH 525 report"""
    try:
        default_start = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        default_end = datetime.now().strftime("%Y-%m-%d")

        filters = {
            "facility": request.args.get("facility", ""),
            "ward": request.args.get("ward", ""),
            "county": request.args.get("county", ""),
            "subcounty": request.args.get("subcounty", ""),
            "country": request.args.get("country", ""),
            "start_date": request.args.get("start_date", default_start),
            "end_date": request.args.get("end_date", default_end),
        }

        result = moh_525_report(filters)
        return create_response(result)
    except Exception as e:
        return handle_error(e)


@app.route("/api/monitoring_report", methods=["GET"])
def monitoring_report_endpoint():
    """Generate monitoring report"""
    try:
        facility = request.args.get("facility", "")
        year = request.args.get("year", datetime.now().year)
        county = request.args.get("county", "")
        subcounty = request.args.get("subcounty", "")

        if year:
            year = int(year)

        result = monitoring_report(
            county=county, subcounty=subcounty, facility=facility, year=year
        )
        return create_response(result)
    except ValueError as e:
        return handle_error(e, 400)
    except Exception as e:
        return handle_error(e)


@app.route("/api/insert_data", methods=["POST"])
def insert_data_endpoint():
    """Insert data into database"""
    try:
        if not request.is_json:
            raise ValueError("Request must be JSON")

        data = request.json
        if not isinstance(data, list):
            raise ValueError("Data must be a list of records")

        result = pg.insert_data(data)
        return create_response({"message": result})
    except ValueError as e:
        return handle_error(e, 400)
    except Exception as e:
        return handle_error(e)


@app.before_request
def before_request():
    """Pre-request processing"""
    if request.method != "OPTIONS":
        app_logger.info(f"Request: {request.method} {request.path}")
        app_logger.debug(f"Args: {request.args}")
        if request.is_json:
            app_logger.debug(f"JSON: {request.json}")


@app.after_request
def after_request(response):
    """Post-request processing"""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"

    app_logger.info(f"Response: {response.status}")
    return response


@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return handle_error(Exception("Resource not found"), 404)


@app.errorhandler(500)
def server_error(e):
    """Handle 500 errors"""
    return handle_error(e)


# Initialize scheduler
scheduler = initialize_scheduler()

# Register scheduler shutdown
atexit.register(lambda: scheduler.shutdown(wait=False))

if __name__ == "__main__":
    try:
        db.init_app(app)
        print("Initializing app context...")
        with app.app_context():
            print("Creating tables...")
            db.create_all()
            print("Tables created successfully")
        app.run(debug=True)
    except Exception as e:
        print(f"Error starting application: {e}")
        print(traceback.format_exc())
