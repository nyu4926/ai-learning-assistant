import sys, os, logging
sys.path.insert(0, ".")

log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.log")
logging.basicConfig(
    filename=log_path, level=logging.INFO,
    format="%(asctime)s %(message)s",
    filemode="a"
)
logging.info("=== Server starting ===")

try:
    from backend.app import app
    from backend.models.database import init_db
    init_db()
    
    # Use threaded=True for better concurrent handling
    logging.info("Running on 0.0.0.0:5000 (threaded)")
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False, threaded=True)
except Exception as e:
    logging.error(f"FATAL: {e}", exc_info=True)
