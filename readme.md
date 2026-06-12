# GitLab Handbook Chatbot

A Retrieval-Augmented Generation (RAG) conversational AI that indexes GitLab Handbook documents and Direction pages into Pinecone and answers user questions using Google Gemini models.

🔗 **Live Demo:** [gitlab-handbook-chatbot-eight.vercel.app](https://gitlab-handbook-chatbot-eight.vercel.app/)

---

## Architecture

```text
User
 │
 ▼
Next.js Application
 │
 ├── Authentication
 ├── Chat UI
 ├── Conversation Management
 ├── MongoDB Atlas
 └── Google Gemini
         │
         ▼
     FastAPI RAG Service
         │
         ├── Pinecone
         ├── BAAI/bge-base-en-v1.5
         └── GitLab Handbook Knowledge Base
```

---

## Repository Structure

```text
GITLAB-HANDBOOK/
│
├── chatbot/      # Next.js application
├── rag/          # FastAPI RAG service
│
├── package.json
├── package-lock.json
└── .gitignore
```

---

## Tech Stack

### Next.js Application

- Next.js, React, TypeScript
- Redux Toolkit
- MongoDB Atlas
- JWT Authentication
- Google Gemini API

### RAG Service

- FastAPI, Python
- Pinecone
- Sentence Transformers (BAAI/bge-base-en-v1.5)

---

## Prerequisites

- Node.js v22+
- Python 3.13+
- MongoDB Atlas account
- Google Gemini API Key ([Get one from Google AI Studio](https://aistudio.google.com/))
- Pinecone account ([pinecone.io](https://www.pinecone.io/))

---

## Environment Variables

### `chatbot/.env.local`

```env
MONGODB_URI=        # Non-SRV MongoDB Atlas connection string (see Troubleshooting)
JWT_SECRET=         # Any secret string of your choice
GEMINI_API_KEY=     # From Google AI Studio
RAG_SERVICE_URL=https://gitlab-handbook-rag-production.up.railway.app/
```

### `rag/.env`

```env
PINECONE_API_KEY=       # From your Pinecone dashboard
PINECONE_INDEX_NAME=    # Any index name of your choice
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
GITLAB_API_TOKEN=       # Optional — prevents GitLab API rate limiting
```

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Ayush-Mamgain/Gitlab-Handbook
cd GITLAB-HANDBOOK
```

### 2. Install Node Dependencies

```bash
# Root dependencies
npm install

# Chatbot dependencies
cd chatbot && npm install && cd ..
```

### 3. Set Up Python Environment

```bash
cd rag
python -m venv .venv
```

Activate the virtual environment:

```bash
# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

Then install dependencies:

```bash
pip install -r requirements.txt
cd ..
```

---

## Running the Project

There are two ways to run the project depending on whether you want to use the deployed RAG service or build your own Pinecone cloud vector database.

### Option A — Use the Deployed RAG Service (Recommended)

This is the quickest way to get started. The `RAG_SERVICE_URL` in `chatbot/.env.local` already points to the deployed service that I created.

Start both services from the root directory:

```bash
npm run dev
```

Available at:

```
Frontend: http://localhost:3000
Backend:  http://localhost:8000
```

---

### Option B — Run the Full RAG Pipeline Locally

Use this if you want to build and manage your own Pinecone vector database in the cloud.

**1.** Update `chatbot/.env.local` to point to your local RAG service:

```env
RAG_SERVICE_URL=http://localhost:8000
```

**2.** Start both services:

```bash
npm run dev
```

**3.** Trigger document ingestion:

```http
POST http://localhost:8000/update
```

**4.** Monitor ingestion progress:

```http
GET http://localhost:8000/status
```

> **Note:** The ingestion process downloads GitLab Handbook documents, generates embeddings, and uploads vectors to Pinecone. Initial ingestion takes approximately **4-5 hours**.
>
> The embedding model (`BAAI/bge-base-en-v1.5`) is downloaded automatically on first startup and may take **5–10 minutes** depending on your internet speed.

Once ingestion completes, the chatbot will use your local vector database for all queries.

---

## API Endpoints (RAG Service)

| Method | Endpoint  | Description                          |
|--------|-----------|--------------------------------------|
| POST   | `/update` | Trigger document ingestion           |
| GET    | `/status` | Check ingestion progress             |

---

## Troubleshooting

### MongoDB Connection Issues

Ensure `MONGODB_URI` is a **non-SRV** connection string in this format:

```
mongodb://<username>:<password>@ac-xxxx-shard-00-00.xxxxx.mongodb.net:27017,ac-xxxx-shard-00-01.xxxxx.mongodb.net:27017,ac-xxxx-shard-00-02.xxxxx.mongodb.net:27017/?ssl=true&replicaSet=atlas-xxxxx-shard-0&authSource=admin&appName=<app-name>
```

SRV-format URIs (`mongodb+srv://...`) are not supported.

### Gemini API Errors

Verify that `GEMINI_API_KEY` in `chatbot/.env.local` contains a valid key from [Google AI Studio](https://aistudio.google.com/).

### RAG Service Errors

Verify that `RAG_SERVICE_URL` points to a reachable RAG service. If running locally, confirm the backend is running at `http://localhost:8000` and check `/status` for diagnostics.

---

## License

This project is provided for educational and development purposes.