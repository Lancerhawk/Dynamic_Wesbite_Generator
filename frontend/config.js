// API Configuration
// This file is generated/updated based on environment variables
window.API_CONFIG = {
  API_BASE: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? "http://localhost:3000"
    : "https://your-backend-name.onrender.com" // This will be replaced by build script
};

