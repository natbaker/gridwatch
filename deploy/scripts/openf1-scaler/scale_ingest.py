import datetime, sys
import requests
from kubernetes import client, config

config.load_incluster_config()

now = datetime.datetime.utcnow()
window_start = now - datetime.timedelta(hours=2)
window_end   = now + datetime.timedelta(hours=1)

try:
    resp = requests.get(
        "http://openf1-api:8000/v1/sessions",
        params={"year": now.year},
        timeout=10,
    )
    resp.raise_for_status()
    sessions = resp.json()
except Exception as e:
    print("Failed to fetch sessions: " + str(e) + " — fail safe, no change")
    sys.exit(0)

def parse_dt(s):
    return datetime.datetime.strptime(s[:19].replace("T", " "), "%Y-%m-%d %H:%M:%S")

in_window = [s for s in sessions if window_start <= parse_dt(s["date_start"]) <= window_end]
print(str(len(in_window)) + " session(s) in window [" + window_start.strftime("%H:%M") + " - " + window_end.strftime("%H:%M") + " UTC]")
for s in in_window:
    print("  " + s.get("session_name", "?") + " @ " + s["date_start"])

target = 1 if in_window else 0
apps = client.AppsV1Api()
current = apps.read_namespaced_deployment("openf1-ingest-realtime", "gridwatch")
current_replicas = current.spec.replicas or 0

if current_replicas == target:
    print("Already at " + str(target) + " replicas, no change")
else:
    apps.patch_namespaced_deployment(
        "openf1-ingest-realtime", "gridwatch",
        {"spec": {"replicas": target}},
    )
    print("Scaled " + str(current_replicas) + " -> " + str(target))
