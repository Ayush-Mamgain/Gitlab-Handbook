# GitLab Handbook Chatbot

GitLab Handbook Chatbot is a Retrieval-Augmented Generation (RAG) conversational AI that indexes GitLab Handbook documents into Pinecone and answers user questions using Google Gemini models.

The project consists of:

- A **Next.js + TypeScript application** responsible for the chatbot UI, authentication, conversation management, MongoDB integration, and Gemini interactions.
- A **FastAPI + Python RAG service** responsible for document ingestion, embedding generation, vector storage, and retrieval.

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

- Next.js
- React
- TypeScript
- Redux Toolkit
- MongoDB Atlas
- JWT Authentication
- Google Gemini API

### RAG Service

- FastAPI
- Python
- Pinecone
- Sentence Transformers
- BAAI/bge-base-en-v1.5

---

## Prerequisites

- Node.js v26+
- Python 3.13+
- MongoDB Atlas
- Google Gemini API Key

---

## Environment Variables

### `chatbot/.env.local`

```env
MONGODB_URI=
JWT_SECRET=
GEMINI_API_KEY=
RAG_SERVICE_URL=https://gitlab-handbook-rag-production.up.railway.app/
```

### `rag/.env` (Optional)

Only required if running the RAG service fully locally.

```env
PINECONE_API_KEY=
PINECONE_INDEX_NAME=
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
GITLAB_API_TOKEN=
```

---

## Installation

### Clone Repository

```bash
git clone https://github.com/Ayush-Mamgain/Gitlab-Handbook
cd GITLAB-HANDBOOK
```

### Install Root Dependencies

```bash
npm install
```

### Install Chatbot Dependencies

```bash
cd chatbot
npm install
cd ..
```

### Setup Python Environment (Optional)

Only required if running the RAG service locally.

```bash
cd rag

python -m venv .venv

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

---

## Running the Project

Start both services from the root directory:

```bash
npm run dev
```

Available at:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:8000
```

By default, the chatbot uses the deployed RAG service configured in:

```env
RAG_SERVICE_URL=
```

---

## Running the Complete RAG Pipeline Locally

If you want to build your own vector database locally:

1. Configure `rag/.env`
2. Start the project

```bash
npm run dev
```

3. Trigger ingestion

```http
GET http://localhost:8000/update
```

### Notes

- The ingestion process downloads GitLab Handbook documents, generates embeddings, and uploads vectors to Pinecone.
- Initial ingestion takes approximately **2 hours**.
- The embedding model (`BAAI/bge-base-en-v1.5`) is downloaded automatically on first startup and may take **5–10 minutes** depending on internet speed.

---

## Troubleshooting

### MongoDB Connection Issues

Verify:

```env
MONGODB_URI=
```

contains a valid MongoDB Atlas connection string.

### Gemini Errors

Verify:

```env
GEMINI_API_KEY=
```

contains a valid API key.

### RAG Service Errors

Verify:

```env
RAG_SERVICE_URL=
```

points to a reachable RAG service.

---

## License

This project is provided for educational and development purposes.