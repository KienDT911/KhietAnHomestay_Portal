# Vercel serverless function entrypoint
import sys
import os

# Fix import path for Vercel
backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend')
sys.path.insert(0, backend_path)

# Import the Flask app from server.py
from server import app

# Expose the app for Vercel
application = app
