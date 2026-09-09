import os

DB_PATH = os.environ.get("SOPKOLL_DB", "./sopkoll.db")
VAPID_PRIVATE = os.environ.get("SOPKOLL_VAPID_PRIVATE", "")
VAPID_PUBLIC = os.environ.get("SOPKOLL_VAPID_PUBLIC", "")
VAPID_SUBJECT = os.environ.get("SOPKOLL_VAPID_SUBJECT", "mailto:noreply@sopkoll.korist.se")
WEB_URL = os.environ.get("SOPKOLL_WEB_URL", "https://sopkoll.korist.se")
TIMEZONE = os.environ.get("SOPKOLL_TIMEZONE", "Europe/Stockholm")
# Same-origin in production (CloudFront routes /api/* here); Vite proxies in dev.
CORS_ORIGINS = [o for o in os.environ.get("SOPKOLL_CORS_ORIGINS", "").split(",") if o]
# Bounds SVOA traffic and DB growth on the shared box.
MAX_DEVICES = int(os.environ.get("SOPKOLL_MAX_DEVICES", "300"))
MAX_ITEMS_PER_DEVICE = 30
SCHEDULER_INTERVAL_S = int(os.environ.get("SOPKOLL_SCHEDULER_INTERVAL", "300"))
# A reminder older than this is not worth sending any more (the bin is out or it is too late).
REMINDER_GRACE_HOURS = 10

SVOA_BASE = (
    "https://www.stockholmvattenochavfall.se/villa-och-radhus/avfallstjanster/nar-kommer-sopbilen"
)
SVOA_CACHE_HOURS = 6
