# API Contracts (REST JSON Endpoints)

This document provides the API contracts detailing how the client-side SPA reacts to REST endpoints. In order to interconnect the frontend with a Laravel/PHP backend, these endpoints must be implemented exactly to receive and dispatch JSON.

---

## 1. Authentication (`/api/auth`)

### 1.1. User Session Auth (`POST /api/auth/login`)
Dispatches user credentials and returns active RBAC profiles.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "admin@laminam.sk",
    "password": "securepassword"
  }
  ```
- **Response (Success - `200 OK`)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": "u-1",
      "name": "Erik",
      "email": "admin@laminam.sk",
      "role": "admin",
      "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
    }
  }
  ```

---

## 2. Leads Module (`/api/leads`)

### 2.1. Retrieve Leads Registry (`GET /api/leads`)
Fetches all leads matching dynamic filters. Supports standard cursor or offset pagination.

- **Response (Success - `200 OK`)**:
  ```json
  [
    {
      "id": "lead-1",
      "name": "Ján Novák",
      "city": "Bratislava",
      "clientType": "business",
      "status": "new",
      "source": "website",
      "owner": "Tomi",
      "value": 12500,
      "createdAt": "2026-05-15",
      "rating": 5,
      "phone": "+421 905 123 456",
      "email": "novak@laminam.sk",
      "address": {
        "street": "Mlynské Nivy 42",
        "city": "Bratislava",
        "postalCode": "821 09",
        "country": "Slovakia"
      },
      "companyId": "36123456",
      "taxId": "2021234567",
      "vatId": "SK2021234567",
      "contactPerson": "Ing. Ján Novák",
      "website": "https://laminam.sk",
      "timeline": [
        {
          "id": "ev-1",
          "type": "phone",
          "timestamp": "2026-05-15 10:00",
          "title": "Discovery Call Logged",
          "content": "Discussed interior stone cladding options..."
        }
      ],
      "categories": ["Kitchen Countertops", "Flooring Tiles"]
    }
  ]
  ```

### 2.2. Create Lead opportunity (`POST /api/leads`)
Pushes a new opportunity into the registry.

- **Request Body**:
  ```json
  {
    "name": "Nové Stavebné S.R.O.",
    "city": "Nitra",
    "clientType": "business",
    "status": "new",
    "source": "facebook",
    "owner": "Erik",
    "value": 8500,
    "rating": 4,
    "categories": ["Bathroom Renovation"]
  }
  ```
- **Response (Success - `201 Created`)**:
  ```json
  {
    "success": true,
    "lead": {
      "id": "lead-dynamic-hash-123",
      "name": "Nové Stavebné S.R.O.",
      "city": "Nitra",
      "clientType": "business",
      "status": "new",
      "source": "facebook",
      "owner": "Erik",
      "value": 8500,
      "rating": 4,
      "createdAt": "2026-06-02",
      "timeline": [],
      "categories": ["Bathroom Renovation"]
    }
  }
  ```

### 2.3. Modify Lead Record (`PUT /api/leads/{id}`)
Updates details (including drag-and-drop state switches).

- **Request Body**:
  ```json
  {
    "name": "Ján Novák (Stavebné zmeny)",
    "value": 14000,
    "status": "contacted",
    "owner": "Tomi"
  }
  ```
- **Response (Success - `200 OK`)**:
  ```json
  {
    "success": true,
    "lead": {
      "id": "lead-1",
      "name": "Ján Novák (Stavebné zmeny)",
      "status": "contacted",
      "value": 14000,
      "owner": "Tomi",
      "createdAt": "2026-05-15"
    }
  }
  ```

### 2.4. Append Timeline Event (`POST /api/leads/{id}/timeline`)
Appends phone logs, email records, custom notes, or files to a specific profile card.

- **Request Body**:
  ```json
  {
    "type": "note",
    "title": "Technical Slabs Dimensions Clarification",
    "content": "Requested 12mm thickness porcelain slabs instead of default 6mm."
  }
  ```
- **Response (Success - `200 OK`)**:
  ```json
  {
    "success": true,
    "timelineEvent": {
      "id": "ev-new-123",
      "type": "note",
      "timestamp": "2026-06-02 15:52",
      "title": "Technical Slabs Dimensions Clarification",
      "content": "Requested 12mm thickness porcelain slabs instead of default 6mm."
    }
  }
  ```

---

## 3. Tasks Module (`/api/tasks`)

### 3.1. Create Task (`POST /api/tasks`)
Saves a new checklist record.

- **Request Body**:
  ```json
  {
    "title": "Cut porcelain slabs prototype",
    "description": "Logistics team coordinates Bratislava cuts",
    "priority": "high",
    "deadline": "2026-06-10",
    "status": "todo",
    "owner": "Tomi",
    "assignedUsers": ["Tomi", "Peter"],
    "relatedLeadId": "lead-1"
  }
  ```

---

## 4. Custom Forms & Submissions (`/api/forms`)

### 4.1. Embed Submission Event (`POST /api/forms/{id}/submit`)
Public unauthenticated REST endpoint targeted by compiled embed forms to submit customer responses into the pipeline.

- **Request Body**:
  ```json
  {
    "name": "Peter Pokusný",
    "phone": "+421 900 111 222",
    "email": "peter@pokus.sk",
    "custom_message": "Chcem cenovú ponuku na obklad krbu."
  }
  ```
- **Response (Success - `200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Form submission stored successfully. Lead generated.",
    "leadId": "lead-from-form-abc"
  }
  ```
