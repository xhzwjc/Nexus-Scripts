import sys
import os
sys.path.append(os.getcwd())
try:
    from app.main import app
    print("Import success")
except Exception as e:
    print(f"Import failed: {e}")
