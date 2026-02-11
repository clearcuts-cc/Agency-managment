# ContentFlow - Creative Agency Calendar

A modern, dark-themed content calendar application designed for creative agencies managing video production workflows.

## 🎨 Features

### Landing Page
- Modern welcome screen with ContentFlow branding
- Feature showcase with 4 key capabilities
- Clean, minimal design

### Calendar View
- **Tasks displayed as colored pills inside calendar day cells**
- Color-coded by production stage:
  - 🔵 **Script** - Blue
  - 🟠 **Shoot** - Orange  
  - 🟣 **Edit** - Purple
  - 🟢 **Post** - Green
  - 🔴 **Ads** - Red
- Click "+" on any day to add tasks
- Month navigation with Today button
- Shows up to 3 tasks per day with "+X more" indicator

### Tasks Page
- List view of all tasks
- Filter by status: All, Pending, In Progress, Done
- Task cards with full details
- Status badges and priority indicators

### Analytics Page
- Performance statistics dashboard
- 4 key metrics:
  - Total Tasks
  - Completed Tasks
  - In Progress Tasks
  - Pending Tasks
- Charts for task distribution by type and status
- Filter by time period: Daily, Monthly, Yearly, Custom

## 🚀 Getting Started

1. Open `landing.html` in your browser
2. Click "Get Started" to enter the application
3. Use the center navigation tabs to switch between views
4. Click the "+" button on calendar days to add tasks

## 💾 Data Storage

All data is stored locally in your browser using localStorage:
- No backend required
- Data persists between sessions
- Sample data included for demonstration

## 🎯 Sample Data

The app includes sample data to demonstrate features:
- 3 clients (TechCorp, Creative Studios, Brand Dynamics)
- 6 tasks across different production stages
- Tasks scheduled across multiple dates

## 🛠️ Technology Stack

- **HTML5** - Structure
- **CSS3** - Styling with custom dark theme
- **Vanilla JavaScript** - No frameworks, pure JS
- **localStorage** - Client-side data persistence
- **Google Fonts** - Inter font family

## 📱 Responsive Design

The interface adapts to different screen sizes for optimal viewing on:
- Desktop computers
- Tablets
- Mobile devices

## 🎨 Design System

### Colors
- **Background**: Pure black (#000000)
- **Cards**: Dark gray (#111111)
- **Borders**: Subtle gray (#1F1F1F)
- **Accent**: Blue gradient (#4F46E5 to #7C3AED)
- **Text**: White with gray variants

### Typography
- **Font**: Inter (Google Fonts)
- **Weights**: 300, 400, 500, 600, 700, 800

## 📂 File Structure

```
├── landing.html              # Welcome page
├── landing-styles.css        # Landing page styles
├── index.html                # Main application
├── styles.css                # Main application styles
└── js/
    ├── storage.js            # Data management
    ├── calendar.js           # Calendar functionality
    └── app.js                # Application logic
```

## 🔧 Key Functions

### Storage Module (`storage.js`)
- `addClient()` - Add new client
- `addTask()` - Create new task
- `getTasksByDate()` - Get tasks for specific date
- `getStats()` - Calculate analytics

### Calendar Module (`calendar.js`)
- `renderCalendar()` - Display calendar grid
- `createDayElement()` - Create day cells with task pills
- `openTaskModal()` - Show task creation form

### App Module (`app.js`)
- `navigateToPage()` - Switch between views
- `renderAnalytics()` - Display statistics
- `renderTasks()` - Show task list

## 🎯 Use Cases

Perfect for:
- Video production agencies
- Content creation teams
- Social media management
- Marketing agencies
- Creative studios

## 📝 Task Properties

Each task includes:
- Title
- Client
- Project name
- Production stage (Script/Shoot/Edit/Post/Ads)
- Status (Pending/In Progress/Done)
- Assignee
- Priority (Low/Medium/High)
- Deadline date

## 🌟 Highlights

- ✅ No installation required - just open in browser
- ✅ No backend needed - fully client-side
- ✅ Modern dark theme design
- ✅ Intuitive task management
- ✅ Visual calendar with colored task indicators
- ✅ Analytics dashboard
- ✅ Responsive layout

## 📄 License

This project is for demonstration and educational purposes.

---

**Built with ❤️ using Caffeine.ai**

Open `landing.html` to get started!
