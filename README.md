# OASA Real-Time Bus Arrivals for Google Maps

A Chrome browser extension that overlays real-time bus arrival times from OASA (Athens Urban Transport Organization) directly on Google Maps.

## 🚌 Overview

This extension seamlessly integrates real-time public transportation data into your Google Maps experience. When viewing bus stops in Athens, Greece on Google Maps, the extension automatically displays live arrival times from the OASA telematics API, helping you plan your journey more effectively.

## ✨ Features

- **Real-Time Arrivals**: Displays live bus arrival times for Athens public transport
- **Google Maps Integration**: Automatically detects bus stops on Google Maps
- **Draggable Popup**: Movable popup interface for better visibility
- **Auto-Refresh**: Automatically updates arrival times to keep information current
- **Smart Observer**: Monitors page changes to detect new bus stops
- **Scroll-Friendly**: Maintains functionality as you navigate the map
- **Footer Branding**: Clean interface with OASA branding

## 🔧 Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/aggelos-pappas/oasa.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in the top right)

4. Click "Load unpacked"

5. Select the cloned `oasa` directory

6. The extension should now appear in your extensions list

## 🚀 Usage

1. Navigate to [Google Maps](https://www.google.com/maps)

2. Search for or click on any bus stop in Athens, Greece

3. The extension will automatically detect the stop and display real-time arrival information

4. Click and drag the popup to reposition it as needed

5. Arrival times refresh automatically to keep you informed

## 📋 Technical Details

### Files

- **manifest.json**: Extension configuration and metadata
- **background.js**: Service worker for handling extension lifecycle
- **content.js**: Main script that runs on Google Maps pages

### Permissions

The extension requires the following permissions:
- `activeTab`: To interact with the current Google Maps tab
- `scripting`: To inject content scripts into Google Maps
- Host access to `https://www.google.com/maps/*`: To run on Google Maps pages

### API Integration

This extension uses the OASA Telematics API to fetch real-time arrival data for Athens public transportation.

## 🛠️ Development

### Technologies Used

- Chrome Extension Manifest V3
- JavaScript (ES6+)
- OASA Telematics API
- Google Maps DOM manipulation

### Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 Recent Updates

- Draggable popup interface
- Footer logo integration
- Auto-refresh functionality
- DOM observer for dynamic content
- Scroll-friendly implementation

## ⚠️ Limitations

- Currently works only for Athens, Greece bus stops
- Requires active internet connection for real-time data
- Limited to bus stops available in the OASA system

## 📄 License

This project is open source and available for use and modification.

## 👤 Author

**Aggelos Pappas**
- GitHub: [@aggelos-pappas](https://github.com/aggelos-pappas)

## 🙏 Acknowledgments

- OASA (Athens Urban Transport Organization) for providing the telematics API
- Google Maps for the mapping platform

---

*Made with ❤️ for Athens commuters*
