# Khiết An Homestay Website

A warm and inviting website for Khiết An Homestay - your home away from home.

## About

This repository contains the source code for the Khiết An Homestay website, designed to showcase our cozy accommodations and genuine hospitality. The website provides guests with an easy way to explore our rooms, amenities, and book their perfect retreat.

## Project Structure

```
KhietAnHomestay/
├── frontend/               # Frontend website files
│   ├── index.html         # Main HTML file
│   ├── css/               # Stylesheets
│   │   └── styles.css     # Main stylesheet
│   ├── js/                # JavaScript files
│   │   └── script.js      # Main script file
│   └── assets/            # Static assets
│       └── images/        # Image files
├── backend/               # Backend API (future development)
├── package.json           # Node.js dependencies and scripts
├── .gitignore            # Git ignore rules
├── .prettierrc           # Code formatting configuration
├── .eslintrc.json        # JavaScript linting rules
└── ReadMe.md             # This file
```

## Features

✨ **Beautiful Design**
- Warm color palette inspired by the homestay logo (sage green, warm brown, cream)
- Smooth animations and transitions
- Fully responsive for all devices

🏡 **User-Friendly Interface**
- Easy navigation with smooth scrolling
- Room browsing with detailed descriptions
- Clear pricing information ($25-$65/night)
- Simple contact form

🎨 **Design Elements**
- Hero section with welcoming message
- About section highlighting homestay features
- Room gallery with amenities and pricing
- Contact information and inquiry form
- Responsive mobile menu

## Color Scheme

Based on the Khiết An logo:
- **Sage Green** (#7B9B7E) - Primary brand color, representing nature and peace
- **Warm Brown** (#B8926A) - Accent color, conveying warmth and comfort
- **Cream** (#FAF8F3) - Background color for soft, welcoming feel
- **Off-White** (#FDFDFB) - Content areas for clean presentation

## Technologies Used

### Frontend
- **HTML5** - Semantic structure
- **CSS3** - Modern styling with custom properties, animations, and grid/flexbox
- **Vanilla JavaScript** - Interactivity, smooth scrolling, and animations
- **Google Fonts** - Playfair Display (headings) & Poppins (body text)

### Development Tools
- **Node.js** - Package management
- **ESLint** - Code quality
- **Prettier** - Code formatting

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm (v6 or higher)
- A modern web browser

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/khiet-an-homestay.git
cd KhietAnHomestay
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

### Alternative: Direct File Access

Simply open `frontend/index.html` in your web browser - no server needed!

## Customization Guide

### Update Room Information
Edit the room cards in `frontend/index.html`:
- Room titles and descriptions
- Pricing information
- Amenities lists
- Availability status

### Update Contact Details
Edit the contact section in `frontend/index.html`:
- Physical address
- Phone number
- Email address
- Check-in/check-out times
- Social media links

### Modify Color Scheme
Edit CSS variables in `frontend/css/styles.css`:
```css
:root {
    --sage-green: #7B9B7E;
    --warm-brown: #B8926A;
    --cream: #FAF8F3;
    /* ... modify as needed */
}
```

### Add Images
1. Place room photos in `frontend/assets/images/`
2. Update image sources in `frontend/index.html`
3. Recommended image sizes:
   - Room images: 800x600px
   - Hero background: 1920x1080px

## Available Scripts

- `npm start` - Start HTTP server on port 3000
- `npm run dev` - Start live-reload development server
- `npm run build` - (Static site, no build needed)
- `npm test` - Run tests (to be configured)

## Browser Support

✅ Chrome, Firefox, Safari, Edge (latest versions)
✅ Mobile browsers (iOS Safari, Chrome Mobile)
✅ Responsive design for tablets and phones

## Purpose

To create an online presence that reflects the comfort, warmth, and personal touch that guests experience at Khiết An Homestay.

## Future Enhancements

### Frontend
- [ ] Add real room images
- [ ] Implement image gallery lightbox
- [ ] Add guest reviews/testimonials section
- [ ] Language switcher (English/Vietnamese)
- [ ] Advanced search and filter for rooms
- [ ] Interactive calendar for availability

### Backend
- [ ] REST API for room management
- [ ] Online booking system
- [ ] Payment gateway integration
- [ ] Email notification system
- [ ] Admin dashboard
- [ ] Database for reservations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Contact

For questions or support, please contact:
- Email: hello@khietanhomestay.com
- Phone: +84 123 456 789

---

*Come as a guest. Leave as family.* 🏡❤️
