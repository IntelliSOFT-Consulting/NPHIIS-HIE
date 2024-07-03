from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
import atexit
import hive
from flask import jsonify, request
from flask_cors import CORS
from configs import app, db
import pg


CORS(app)


scheduler = BackgroundScheduler()
scheduler.start()
scheduler.add_job(
    func=hive.query_data,
    trigger=IntervalTrigger(minutes=30),
    id="query_data_job",
    name="Query data from Hive every 30 minutes",
    replace_existing=True,
)

atexit.register(lambda: scheduler.shutdown())


@app.route("/api/analytics", methods=["POST"])
def analytics():
    try:
        hive.query_data()
        return jsonify({"message": "Data fetched and inserted into the database"})
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.route("/api/defaulters", methods=["GET"])
def defaulters():
    try:
        name = request.args.get("name", "")
        vaccine_name = request.args.get("vaccine_name", "")
        start_date = request.args.get("start_date", "")
        end_date = request.args.get("end_date", "")
        result = pg.query_defaulters(name, vaccine_name, start_date, end_date)
        return jsonify(result)
    except Exception as e:
        return jsonify({"message": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
    db.create_all()
    app.run(debug=True)
