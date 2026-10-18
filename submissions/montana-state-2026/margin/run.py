"""Start Margin with ordinary Python or the checkout's local dependencies."""
from pathlib import Path
import socket
import sys

ROOT = Path(__file__).resolve().parent
PACKAGES = ROOT / '.python-packages'
if PACKAGES.exists():
    sys.path.insert(0, str(PACKAGES))

if __name__ == '__main__':
    import uvicorn

    print('\nMargin - a tutor in your margin')
    print('Laptop: http://127.0.0.1:8000')
    try:
        addresses = sorted({entry[4][0] for entry in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)})
        for address in addresses:
            if not address.startswith('127.'):
                print(f'Same Wi-Fi: http://{address}:8000')
    except OSError:
        pass
    print('Keep this window running during your demo.\n')
    uvicorn.run('main:app', host='0.0.0.0', port=8000, app_dir=str(ROOT), log_level='warning', access_log=False)
