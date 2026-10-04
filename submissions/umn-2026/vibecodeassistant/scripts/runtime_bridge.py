"""Apply Anvith's actual runtime rules to browser evidence from the Node runner."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from runtime.checks import run
from runtime.models import to_json
payload = json.load(sys.stdin)
print(to_json(run(payload['pages'], payload['link_sources'], payload['target_host'])))
