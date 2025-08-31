# ConcordiaSync

A secure Chrome extension that extracts course schedules from Concordia University's student portal and exports them to Google Calendar-compatible CSV format.

## Features

- **Secure Data Extraction**: Safely parses course schedules from Concordia's student portal
- **Input Validation**: Comprehensive sanitization and validation of all extracted data
- **Google Calendar Export**: Generates properly formatted CSV files for easy calendar import
- **Break Week Handling**: Automatically excludes common university break periods
- **Privacy-First**: No data sent to external servers - all processing happens locally

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The ConcordiaSync icon should appear in your browser toolbar

## Usage

1. Navigate to your Concordia student portal schedule page
2. Click the ConcordiaSync extension icon
3. Click "Extract Schedule" to parse your course data
4. Review the found courses in the preview
5. Click "Download CSV" to save the calendar file
6. Import the CSV file into Google Calendar

## Security Features

- All user input is sanitized using HTML entity encoding
- CSV fields are properly escaped to prevent injection attacks
- No sensitive data is stored or transmitted externally
- Content Security Policy enforced through manifest
- Input validation on all extracted course data

## Browser Support

- Chrome 88+
- Edge 88+
- Other Chromium-based browsers with Manifest V3 support

## Privacy

This extension operates entirely locally. No data is sent to external servers or third-party services. All schedule parsing and CSV generation happens within your browser.

## Development

### Project Structure
```
ConcordiaSync/
├── manifest.json          # Extension manifest
├── popup.html             # Main popup interface
├── css/
│   └── popup.css          # Popup styling
├── js/
│   ├── content.js         # Content script for schedule extraction
│   └── popup.js           # Popup logic and CSV generation
└── assets/
    ├── icon-16.png        # Extension icons
    ├── icon-48.png
    └── icon-128.png
```

### Building

No build process required. The extension runs directly from source files.

### Testing

1. Load the extension in Chrome developer mode
2. Navigate to Concordia student portal
3. Test schedule extraction functionality
4. Verify CSV export and Google Calendar compatibility

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper security considerations
4. Test thoroughly
5. Submit a pull request

## Support

For issues related to Concordia University's portal changes or general usage questions, please open an issue on GitHub.