
# 图酷 (TuKu) - Online Image Processor & Market Terminal

## 🚀 Deployment Guide

1.  **Get Gemini API Key**:
    *   Visit [Google AI Studio](https://aistudio.google.com/app/apikey).
    *   Create a free API Key.
    *   Copy the Key (starts with `AIza...`).

2.  **Configure Environment**:
    *   Create a `.env` file in the project root:
    ```bash
    API_KEY=你的真实Key
    ```

3.  **Run with Docker**:
    ```bash
    docker compose up -d --build
    ```

## 📁 Project Structure
* `/components`: Frontend React components.
* `/server`: Backend Node.js server with Gemini integration.
* `docker-compose.yml`: System orchestration.

## 📝 Features
* **Image Core**: Secure resizing, conversion, and watermarking.
* **Data Core**: Real-time stock analysis powered by Gemini (requires Code: 666888).
