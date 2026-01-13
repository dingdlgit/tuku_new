
# 图酷酷 (TUKUKU) - Online Image Processor

## 📁 Project Structure

```
/
├── components/       # React UI Components
├── server/           # Backend Node.js Code
│   ├── index.js      # Server logic
│   └── package.json
├── App.tsx           # Main React App
├── Dockerfile        # Frontend Build definition
├── Dockerfile.backend # Backend Build definition
├── docker-compose.yml # Orchestration
├── nginx.conf        # Web Server Config
└── ...
```

## 🚀 One-Click Deployment (Server)

1.  **Transfer Files**: Upload this entire directory to your Ubuntu server (e.g., via SCP or Git).
2.  **Run Deploy Command**:
    ```bash
    docker compose up -d --build
    ```
3.  **Access**: Open your browser and visit `http://YOUR_SERVER_IP`.

## 🔧 Local Development

1.  **Backend**:
    ```bash
    cd server
    npm install
    npm start
    ```
2.  **Frontend** (Requires creating a full vite project if running outside Docker):
    *   This codebase is optimized for Docker deployment. For local dev, ensure you have Vite installed.

## 📝 Features
*   **Upload**: Drag & drop up to 20MB.
*   **Process**: Resize, Convert (WebP/PNG/JPG), Rotate, Flip, Grayscale, Blur.
*   **Security**: Auto-cleanup of files every 30 minutes.
