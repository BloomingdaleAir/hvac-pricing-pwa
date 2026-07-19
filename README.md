# HVAC Service Pricing PWA

A mobile-first FastAPI + React Progressive Web App based on the HVAC service pricing workbook.

## Included
- Editable business assumptions
- Service-call time and cost inputs
- Labor, overhead, and break-even calculations
- Margin-based parts selling price
- Desired profit margin
- Retail, Discount, and Member pricing cards
- Profit dollars and realized profit margin
- Local browser storage for settings
- Installable PWA shell and offline caching
- Docker files

## Pricing formulas
- Labor cost per billable hour = (annual wages + payroll burden) / billable hours
- Overhead cost per billable hour = annual technician overhead / billable hours
- Break-even hourly rate = labor rate + overhead rate
- Parts selling price = parts cost / (1 - parts margin)
- Target member price = priced subtotal / (1 - desired profit margin)
- Retail = target member price / (1 - member discount)
- Discount = retail × (1 - customer discount)
- Member = retail × (1 - member discount)
- Profit dollars = selling price - actual job cost

## Run locally

### 1. Start the API
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API: http://localhost:8000
Docs: http://localhost:8000/docs

### 2. Start React
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

## Run with Docker
```bash
docker compose up --build
```
Open http://localhost:8080

## Deploy
A simple production setup is:
1. Deploy `backend` as a Python web service on Render, Railway, Fly.io, or similar.
2. Set its start command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
3. Deploy `frontend` to Vercel, Netlify, or Cloudflare Pages.
4. Add frontend environment variable `VITE_API_URL=https://your-api-domain.example`.
5. Rebuild the frontend.
6. On each technician phone, open the HTTPS site and choose **Add to Home Screen**.

## Important production notes
- HTTPS is required for full PWA installation and service workers.
- Add authentication before storing customer information.
- Put business assumptions in a secured admin database for multi-technician use.
- The current PWA stores assumptions locally in each phone's browser.
