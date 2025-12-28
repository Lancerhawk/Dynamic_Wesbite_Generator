# SkyThought - AI-Powered Website Generator

An intelligent system that generates complete, functional websites from natural language intents using Claude AI. The system analyzes user requirements, extracts website details, filters relevant data, generates multi-page websites with custom branding, and deploys them automatically to Vercel.

## 🚀 Features

- **Natural Language Processing**: Understands user intents and requirements
- **Website Details Extraction**: Automatically extracts website name, tagline, and description from user intent
- **Smart Modal System**: Prompts users for website details when not found in intent
- **Multi-Data Source Support**: Works with movies, companies, products, actors, directors, testimonials
- **Intelligent Page Generation**: Creates pages only when explicitly requested (simple, moderate, or complex requests)
- **AI-Powered Validation**: Automatically validates and fixes generated code
- **Automatic Deployment**: Deploys websites to Vercel and returns live URLs
- **Real-Time Logging**: Provides live updates during generation (200ms polling)
- **Model Selection**: Supports both OpenRouter (Sonnet 4.5) and Anthropic (Haiku)
- **Custom Branding**: Uses extracted or user-provided website name, tagline, and description throughout generated sites
- **Design Customization**: Detects color preferences from user intent (blue, red, green, dark, light, minimal, etc.)

## 📊 Complete Workflow Diagram

```mermaid
flowchart TD
    Start([User Opens Frontend]) --> Load[Page Loads<br/>Modal Hidden]
    Load --> Input[User Enters Intent]
    Input --> Validate{Intent Valid?}
    Validate -->|No| Error[Show Error<br/>Hide Modal]
    Error --> Input
    Validate -->|Yes| Extract[Extract Website Details<br/>POST /api/extract-website-details]
    
    Extract --> CheckDetails{Website Name<br/>Found?}
    CheckDetails -->|No| Modal[Show Modal<br/>Collect Details]
    CheckDetails -->|Yes| Generate[Start Generation]
    
    Modal --> UserInput[User Fills Form<br/>or Skips]
    UserInput --> Generate
    
    Generate -->|POST /api/generate-website| Backend[Backend: Express Server]
    Backend --> Rephrase[Intent Rephraser<br/>Claude API Call #1<br/>Rephrases intent]
    
    Rephrase --> Analyze[Intent Analyzer<br/>Claude API Call #2<br/>Extracts: dataSource, filters, limit]
    
    Analyze --> Verify[Data Source Verifier<br/>Claude API Call #3<br/>Double-checks data source]
    
    Verify --> Filter[Data Filter<br/>Loads data/{source}.json<br/>Applies filters & limit]
    
    Filter --> Plan[Architecture Planner<br/>Claude API Call #4<br/>Plans pages based on intent complexity]
    
    Plan --> FileGen[File Generator Loop<br/>For each file in architecture]
    
    FileGen --> GenFile[Generate File<br/>Claude API Call #5, #6, #7...<br/>Uses websiteDetails for branding]
    
    GenFile --> Validate[Website Validator<br/>Claude API Call #N+1<br/>Validates all files]
    
    Validate --> Fix{Issues Found?}
    Fix -->|Yes| FixFile[Fix Issues<br/>Claude API Call #N+2, #N+3...]
    FixFile --> Validate
    Fix -->|No| Save[Save Files<br/>Create data.json<br/>Create vercel.json]
    
    Save --> Deploy[Vercel Deployer<br/>Deploy to Vercel CLI]
    
    Deploy --> Status[Update Status<br/>Store in memory]
    
    Status --> Poll[Frontend Polls<br/>GET /api/logs/:projectId<br/>Every 200ms]
    
    Poll --> Display[Display Logs<br/>Real-time updates]
    
    Display --> Complete{Status<br/>Complete?}
    Complete -->|No| Poll
    Complete -->|Yes| URL[Show Deployed URL<br/>https://project-xxx.vercel.app]
    
    URL --> End([User Receives Live Website])
    
    style Start fill:#f9f,stroke:#333,stroke-width:2px,color:#000
    style End fill:#9f9,stroke:#333,stroke-width:2px,color:#000
    style Load fill:#eef,stroke:#333,stroke-width:2px,color:#000
    style Extract fill:#bbf,stroke:#333,stroke-width:2px,color:#000
    style Modal fill:#fbf,stroke:#333,stroke-width:2px,color:#000
    style Generate fill:#bfb,stroke:#333,stroke-width:2px,color:#000
    style Rephrase fill:#bbf,stroke:#333,stroke-width:2px,color:#000
    style Analyze fill:#bbf,stroke:#333,stroke-width:2px,color:#000
    style Verify fill:#bbf,stroke:#333,stroke-width:2px,color:#000
    style Filter fill:#fbf,stroke:#333,stroke-width:2px,color:#000
    style Plan fill:#bbf,stroke:#333,stroke-width:2px,color:#000
    style GenFile fill:#bfb,stroke:#333,stroke-width:2px,color:#000
    style Validate fill:#fbb,stroke:#333,stroke-width:2px,color:#000
    style Deploy fill:#fbf,stroke:#333,stroke-width:2px,color:#000
    style URL fill:#9f9,stroke:#333,stroke-width:2px,color:#000
```

## 🔄 Detailed Step-by-Step Process

### Step 0: Frontend Initialization
```
Page Load → Modal Hidden (multiple safeguards)
         → User Interface Ready
```

### Step 1: User Input & Validation
```
User → Enters Intent → Clicks "Generate Website"
                    ↓
              Validate Intent (not empty)
                    ↓
              If empty → Show Error, Hide Modal
                    ↓
              If valid → Proceed
```

### Step 2: Website Details Extraction (NEW)
```
Valid Intent → POST /api/extract-website-details
             → Website Details Extractor (Claude API Call #0)
             → Extracts: websiteName, tagline, description
             ↓
        Check if websiteName exists
             ↓
        If missing → Show Modal
        If found → Proceed to generation
```

### Step 3: Modal Collection (NEW)
```
Modal Shown → User fills form (websiteName, tagline, description)
           → OR User clicks "Skip"
           → Modal Hidden
           → Proceed with collected details (or null)
```

### Step 4: Intent Rephrasing
```
Intent + Website Details → POST /api/generate-website
                         → Intent Rephraser (Claude API Call #1)
                         → Rephrases into clear, structured format
                         → Returns: Rephrased intent
```

### Step 5: Intent Analysis
```
Rephrased Intent → Intent Analyzer (Claude API Call #2)
                 → Detects data source (movies/companies/products/etc.)
                 → Extracts filters (year, genre, location, category, etc.)
                 → Determines limit (default: 100, adjusts for "all")
                 → Returns: { dataSource, filters, limit }
```

### Step 6: Data Source Verification
```
Analysis Result → Data Source Verifier (Claude API Call #3)
               → Double-checks data source selection
               → Confirms or corrects if wrong
               → Returns: Verified data source
```

### Step 7: Data Filtering
```
Verified Source + Filters → Data Filter
                           → Loads data from data/{source}.json
                           → Applies filters (location, category, genre, year, etc.)
                           → Applies limit
                           → Returns: Filtered data array
                           → If 0 results, returns all data (with warning)
```

### Step 8: Architecture Planning
```
Intent + Filtered Data → Architecture Planner (Claude API Call #4)
                       → Analyzes intent complexity:
                         * SIMPLE: Just index.html + app.js
                         * MODERATE: index.html + one requested page + app.js
                         * COMPLEX: index.html + all mentioned pages + app.js
                       → Returns: { files: [{ fileName, purpose, kind }] }
```

### Step 9: File Generation (Per File)
```
For each file in architecture:
  File Generator (Claude API Call #5, #6, #7, ...)
  - Uses websiteDetails for branding (name, tagline, description)
  - Generates HTML with embedded Tailwind CSS
  - Generates JavaScript for interactivity
  - Includes filtered data context
  - Detects color preferences from intent
  - Returns: Raw file content
```

### Step 10: Validation & Fixing
```
Generated Files → Website Validator (Claude API Call #N+1)
                → Checks for markdown code fences
                → Validates syntax
                → Identifies issues (truncation, broken tags, etc.)
                → Fixes problems (Claude API Call #N+2, #N+3, ...)
                → Returns: Validated files
```

### Step 11: File Assembly
```
Validated Files → File System
                 → Creates project folder: generated-sites/project-{timestamp}/
                 → Saves all HTML/JS files
                 → Creates data.json with filtered data
                 → Creates vercel.json for deployment
```

### Step 12: Deployment
```
Project Folder → Vercel Deployer
               → Runs: vercel deploy --prod --yes
               → Parses deployment URL from CLI output
               → Returns: Deployed URL (https://project-xxx.vercel.app)
```

### Step 13: Real-Time Updates
```
Backend → Log Store (In-Memory)
         → Captures all console.log/error/warn
         → Stores per project ID
         ↓
Frontend → Polls GET /api/logs/:projectId (every 200ms)
          → Displays real-time logs with color coding
          → Shows progress updates
          → Displays final URL when complete
```

## 📁 Project Structure

```
dynamic_site_generator/
├── frontend/
│   └── index.html          # User interface with modal system
├── backend/
│   ├── src/
│   │   ├── server.ts                    # Express server & API endpoints
│   │   ├── intent-rephraser.ts          # Step 4: Rephrase intent
│   │   ├── intent-analyzer.ts           # Step 5: Analyze intent
│   │   ├── data-source-verifier.ts      # Step 6: Verify data source
│   │   ├── data-filter.ts               # Step 7: Filter data
│   │   ├── architecture-planner.ts       # Step 8: Plan structure
│   │   ├── website-generator.ts         # Step 9: Orchestrate generation
│   │   ├── file-generator.ts             # Step 9: Generate individual files
│   │   ├── website-validator.ts          # Step 10: Validate & fix
│   │   ├── vercel-deployer.ts            # Step 12: Deploy to Vercel
│   │   ├── website-details-extractor.ts  # NEW: Extract website details
│   │   └── anthropic-client.ts          # API client wrapper (OpenRouter + Anthropic)
│   ├── package.json
│   └── tsconfig.json
├── data/
│   ├── movies.json
│   ├── companies.json
│   ├── products.json
│   ├── actors.json
│   ├── directors.json
│   └── testimonials.json
├── generated-sites/        # Generated websites stored here
│   └── project-{timestamp}/
│       ├── index.html
│       ├── about.html      # (if requested)
│       ├── browse.html     # (if requested)
│       ├── details.html    # (if requested)
│       ├── contact.html    # (if requested)
│       ├── app.js
│       ├── data.json
│       └── vercel.json
├── .env                    # Environment variables (not in repo)
└── README.md
```

## 🔌 API Endpoints

### `POST /api/extract-website-details` (NEW)
Extracts website details (name, tagline, description) from user intent.

**Request:**
```json
{
  "intent": "I want a company website for TechCorp",
  "provider": "openrouter" | "anthropic"
}
```

**Response:**
```json
{
  "websiteName": "TechCorp",
  "tagline": "Your Trusted Partner",
  "description": "Leading technology solutions provider"
}
```

### `POST /api/generate-website`
Generates a complete website from user intent.

**Request:**
```json
{
  "intent": "I want a company website with about and products pages",
  "provider": "openrouter" | "anthropic",
  "websiteDetails": {
    "websiteName": "TechCorp",
    "tagline": "Your Trusted Partner",
    "description": "Leading technology solutions provider"
  }
}
```

**Response:**
```json
{
  "projectId": "project-1234567890",
  "status": "in_progress",
  "message": "Generation started"
}
```

### `GET /api/logs/:projectId`
Retrieves real-time logs for a project.

**Response:**
```json
{
  "logs": [
    {
      "timestamp": 1234567890,
      "level": "info",
      "message": "Starting generation..."
    }
  ],
  "projectId": "project-1234567890"
}
```

### `GET /api/status/:projectId`
Gets the current status of a project.

**Response:**
```json
{
  "status": "completed",
  "deployedUrl": "https://project-123.vercel.app",
  "projectPath": "generated-sites/project-1234567890",
  "publicUrl": "/generated-sites/project-1234567890/index.html"
}
```

### `POST /api/analyze-intent`
Analyzes user intent and returns data source, filters, and limit.

### `POST /api/generate-page`
Generates a dynamic page for an existing project.

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Vercel CLI (for deployment) - installed via `npx` automatically
- API keys:
  - OpenRouter API key (for Sonnet 4.5)
  - Anthropic API key (for Haiku)
  - Vercel token (optional, for deployment)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd dynamic_site_generator
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Set up environment variables**
Create `.env` in the root directory:
```env
# OpenRouter (for Sonnet 4.5)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5

# Anthropic (for Haiku)
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-3-haiku-20240307

# Vercel (optional, for deployment)
VERCEL_TOKEN=...

# Server
PORT=3000
```

4. **Build and start the backend**
```bash
cd backend
npm run build
npm start
```

5. **Open the frontend**
Open `frontend/index.html` in a browser or serve it with a local server.

## 🎯 Usage Example

1. **User enters intent:**
   ```
   "I want a company website for TechCorp with an about page showing our mission and vision, 
   and a products page to browse all our services"
   ```

2. **System processes:**
   - Extracts website details: `websiteName: "TechCorp"` (found in intent)
   - Rephrases intent for clarity
   - Detects data source: `companies`
   - Filters companies data (all records, limit: 100)
   - Plans architecture: `index.html`, `about.html`, `browse.html`, `app.js` (complex request)
   - Generates each file with Claude, using "TechCorp" as website name
   - Validates and fixes code
   - Deploys to Vercel

3. **User receives:**
   - Real-time logs during generation (updates every 200ms)
   - Final deployed URL: `https://project-123.vercel.app`
   - Website with custom branding (TechCorp name, mission, vision, products)

### Example: Website Details Modal

If user intent doesn't include a website name:
```
User: "Show me all action movies from 2024"
     ↓
System extracts: websiteName = null
     ↓
Modal appears: "Please provide some details about your website"
     ↓
User fills: websiteName = "MovieHub", tagline = "Discover Amazing Movies"
     ↓
Generation proceeds with custom branding
```

## 🔧 Technical Details

### AI Model Usage
- **OpenRouter (Sonnet 4.5)**: Higher quality, more expensive, 3000 token limit for file generation
- **Anthropic (Haiku)**: Faster, more cost-effective, 4000 token limit for file generation
- Token limits optimized per provider and operation type

### Website Details System (NEW)
- **Extraction**: Uses Claude to extract websiteName, tagline, description from intent
- **Modal System**: Shows modal only when:
  - User has entered a valid intent
  - User clicked "Generate Website"
  - Extraction API succeeded
  - Website name is missing
- **Branding**: Website details are passed to file generator and used throughout:
  - Website name in titles, headers, navigation
  - Tagline displayed prominently
  - Description used in meta tags and about sections
  - Default: "SkyThought" if no name provided

### Data Sources
- **Movies**: year, genre, rating, director, actors, plot
- **Companies**: name, industry, location, mission, vision, people
- **Products**: name, category, personas, useCases, price, trialDays
- **Actors**: name, gender, location, about, bestFilms
- **Directors**: name, location, bestFilms, about
- **Testimonials**: name, role, company, location, rating, text

### Architecture Planning Intelligence
- **Simple Requests**: "show movies", "list products" → Only `index.html` + `app.js`
- **Moderate Requests**: "movies with about page" → `index.html` + `about.html` + `app.js`
- **Complex Requests**: "company website with mission and products" → All mentioned pages + `app.js`
- Pages only created when explicitly requested or implied by keywords

### Generation Strategy
- **One API call per file**: Prevents token limit issues
- **Multi-step validation**: Ensures code quality
- **Automatic fixing**: Claude reviews and corrects generated code
- **Smart page creation**: Only creates pages when explicitly requested
- **Design customization**: Detects color preferences from intent

### Real-Time Logging
- **Polling frequency**: 200ms for near real-time updates
- **Log storage**: In-memory per project ID
- **Log types**: info, success, warning, error, step
- **Auto-scroll**: Logs container scrolls to latest entry

## 📝 Key Features Explained

### Website Details Extraction (NEW)
Automatically extracts website name, tagline, and description from user intent. If not found, prompts user via modal to provide these details. This ensures all generated websites have proper branding.

### Modal System (NEW)
Smart modal that:
- Only appears when needed (website name missing)
- Validates intent before showing
- Allows user to provide details or skip
- Properly hidden on page load (multiple safeguards)
- Uses both `hidden` attribute and `display: none` style

### Intent Rephrasing
Improves AI understanding by converting casual language into structured requirements.

### Data Source Detection
Intelligent keyword matching with AI verification ensures correct data source selection. Handles edge cases like "company website" vs "products for businesses".

### Architecture Planning
AI determines which pages to create based on user requirements:
- Simple: Just listing data → minimal pages
- Moderate: One specific page mentioned → that page + index
- Complex: Multiple pages or business terms → all relevant pages

### Real-Time Logging
In-memory log store captures all console output and streams to frontend via 200ms polling. Color-coded log types for better UX.

### Automatic Deployment
Uses Vercel CLI to deploy static sites and returns live URLs immediately. Handles Windows and Unix systems.

## 🐛 Troubleshooting

### Issue: Modal appears on page load
- **Fixed**: Modal now has multiple safeguards:
  - `hidden` attribute in HTML
  - `style="display: none"` inline
  - JavaScript `hideModal()` on page load
  - Event listeners on DOMContentLoaded and load

### Issue: Getting 0 records
- Check if filters are too restrictive
- Verify data source is correct
- Check logs for filter details
- System now returns all data if filters result in 0 records (with warning)

### Issue: Only 2 pages created
- This is intentional for simple requests
- Ensure user explicitly requests pages (e.g., "with about page")
- Check logs for architecture planning response
- Complex requests (company website, portfolio) create all pages

### Issue: Deployment fails
- Verify Vercel token is set (optional, generation works without it)
- Check Vercel CLI is accessible via `npx`
- Ensure project folder has valid files
- Check logs for deployment error messages

### Issue: Website name not used
- Ensure website details are provided (via extraction or modal)
- Check that extraction API succeeded
- Verify websiteDetails are passed to generateWebsite function

## 🆕 Recent Updates & Fixes

### Version 2.0 Updates
- ✅ **Website Details Extraction**: New feature to extract and use website name, tagline, description
- ✅ **Modal System**: Smart modal for collecting website details when not found in intent
- ✅ **Modal Visibility Fixes**: Fixed modal appearing on page load (multiple safeguards)
- ✅ **Intent Validation**: Enhanced validation before API calls
- ✅ **Error Handling**: Improved error handling throughout the flow
- ✅ **Branding Support**: Website details used throughout generated sites
- ✅ **Design Customization**: Color preference detection from user intent
- ✅ **Architecture Intelligence**: Smarter page creation based on intent complexity
- ✅ **Real-Time Logging**: 200ms polling for near-instant updates
- ✅ **Data Filtering**: Returns all data if filters result in 0 records (with warning)

## 📄 License

[Your License Here]

## 🤝 Contributing

[Contributing Guidelines Here]

---

**Built with ❤️ using Claude AI, Express, TypeScript, Tailwind CSS, and Vercel**

**SkyThought** - Transform your ideas into websites in seconds
