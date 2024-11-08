const screenshot = require('screenshot-desktop');
const activeWin = require('active-win');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const { exec } = require('child_process');
const fs = require('fs');
let currentWebsite = null;
let previousWebsite = null;
let startTime = null;
let elapsedTime = 0; // Cumulative elapsed time
let intervalId = null;
let mainWindow;
let isTracking = false;
let lastWindowId = null;
let lastTitle = '';
let isCapturing = false;

// Helper function to check if the text contains browser-specific keywords
function isBrowserPage(text) {
  const browserKeywords = [
    'http', 'https', 'www', '.com', '.net', '.org', '.io', '.gov', '.edu', '.co', '.us', '.uk', '.ca', '.de', '.jp', '.fr', '.au', '.ru', '.ch', '.it', '.nl', '.se', '.no', '.es', '.mil'
  ];
  return browserKeywords.some(keyword => text.includes(keyword));
}

// Calculate the total elapsed time
function calculateTimeSpent() {
  const endTime = new Date();
  return elapsedTime + Math.floor((endTime - startTime) / 1000); // In seconds
}

// Format time in seconds to "Xm Ys" format
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Capture the active browser tab and analyze screenshot for URL
async function captureAndAnalyze(activeWindow) {
  try {

    
    const {id, bounds } = activeWindow;

    if (process.platform === 'linux') {
      // Linux-specific screenshot capture using `import` and `xdotool`
      const screenshotCmd = `import -window ${id} /tmp/active-window.png`;
      exec(screenshotCmd, async (error) => {
        if (error) {
          console.error('Error capturing screenshot on Linux:', error);
          return;
        }

        const croppedImage = await sharp('/tmp/active-window.png').extract().toBuffer();
        const { data } = await Tesseract.recognize(croppedImage, 'eng');

        for (const line of data.lines || []) {
          for (const word of line.words) {
            const cleanedText = word.text.replace(/([a-zA-Z0-9-]+)(com|net|org|io|gov|edu|co|uk|de|jp|fr|au|ru|it|nl|ca|us|mil)\b/, '$1.$2');
            if (isBrowserPage(cleanedText)) {
              if (currentWebsite) {
                previousWebsite = currentWebsite;
                mainWindow.webContents.send('url-update', {
                  url: previousWebsite.url,
                  timeSpent: formatTime(calculateTimeSpent()),
                });
              }

              currentWebsite = { url: cleanedText };
              startTime = new Date();
              elapsedTime = 0;
              return;
            }
          }
        }
      });
    } else {
    const imgs = await screenshot.all();
    let closestScreenshot = null;
    let minDistance = Infinity;
    let closestScreenBounds = null;

    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const metadata = await sharp(img).metadata();
      const screenWidth = metadata.width;
      const screenHeight = metadata.height;

      const screenBounds = { x: i * screenWidth, y: 0, width: screenWidth, height: screenHeight };
      const distance = Math.sqrt((bounds.x - screenBounds.x) ** 2 + (bounds.y - screenBounds.y) ** 2);

      if (distance < minDistance) {
        minDistance = distance;
        closestScreenshot = img;
        closestScreenBounds = screenBounds;
      }
    }

    if (closestScreenshot && closestScreenBounds) {
      const adjustedLeft = Math.max(0, bounds.x - closestScreenBounds.x);
      const adjustedTop = Math.max(0, bounds.y - closestScreenBounds.y);
      const width = Math.min(bounds.width, closestScreenBounds.width - adjustedLeft);
      const height = Math.min(bounds.height, closestScreenBounds.height - adjustedTop);

      if (width > 0 && height > 0) {
        const croppedImage = await sharp(closestScreenshot)
          .extract({
            left: adjustedLeft,
            top: adjustedTop,
            width: Math.round(width),
            height: Math.round(height/12)
          })
          .toBuffer();
        fs.writeFileSync('cropped.png', croppedImage);
        const { data } = await Tesseract.recognize(croppedImage, 'eng');
        const text = data.text.trim();

        for (const line of data.lines || []) {
          for (const word of line.words) {
            const cleanedText = word.text.replace(/([a-zA-Z0-9-]+)(com|net|org|io|gov|edu|co|uk|de|jp|fr|au|ru|it|nl|ca|us|mil)\b/, '$1.$2');
            if (isBrowserPage(cleanedText)) {
              if (currentWebsite) {
                previousWebsite = currentWebsite;
                mainWindow.webContents.send('url-update', {
                  url: previousWebsite.url,
                  timeSpent: formatTime(calculateTimeSpent()),
                });
              }

              currentWebsite = { url: cleanedText };
              startTime = new Date();  // Reset the start time to now
              elapsedTime = 0; // Reset cumulative time only on a new URL

              return;
            }
          }
        }
      }
      
    } else {
      console.log('No matching screenshot found for the active window location.');
    }
  }
  } catch (error) {
    console.error('Error capturing active browser tab:', error);
  }
}


// Extract and crop the image based on bounds
const extractAndCrop = async (imagePath, bounds, screenBounds = { x: 0, y: 0, width: Infinity, height: Infinity }) => {
  const left = Math.max(0, bounds.x - screenBounds.x);
  const top = Math.max(0, bounds.y - screenBounds.y);
  const width = Math.min(bounds.width, screenBounds.width - left);
  const height = Math.min(bounds.height, screenBounds.height - top);

  if (width > 0 && height > 0) {
    return sharp(imagePath)
      .extract({
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height / 12)
      })
      .toBuffer();
  } else {
    console.error('Invalid extraction dimensions.');
    return null;
  }
};
// Monitor changes in the active window
async function monitorActiveWindow() {
  intervalId = setInterval(async () => {
    if (!isTracking) return;

    const activeWindow = await activeWin();
    if (activeWindow) {
      const currentTitle = activeWindow.title;

      if ((activeWindow.id !== lastWindowId || currentTitle !== lastTitle) && !isCapturing) {
        isCapturing = true;
        if (activeWindow && /chrome|firefox|edge|safari/i.test(activeWindow.owner.name)) {
          await captureAndAnalyze(activeWindow);
        } else {
          console.log('Active window is not a browser. Skipping URL capture.');
        }

        lastWindowId = activeWindow.id;
        lastTitle = currentTitle;

        setTimeout(() => {
          isCapturing = false;
        }, 3000);
      }
    }

    // Update the elapsed time display every second while tracking
    if (startTime) {
      mainWindow.webContents.send('timer-update', formatTime(calculateTimeSpent()));
    }
  }, 1000);
}

// Start tracking URLs and time
function startTracking(window) {
  mainWindow = window;
  if (!startTime) {
    startTime = new Date(); // Set start time only if not already set
  }
  isTracking = true;
  monitorActiveWindow();
}

// Stop tracking URLs and time (pause the timer)
function stopTracking() {
  isTracking = false;
  clearInterval(intervalId);

  // Update the elapsed time to include the last active period
  if (startTime) {
    elapsedTime += Math.floor((new Date() - startTime) / 1000);
    startTime = null;
  }

  if (currentWebsite) {
    mainWindow.webContents.send('url-update', {
      url: currentWebsite.url,
      timeSpent: formatTime(elapsedTime),
    });
  }
}

module.exports = { startTracking, stopTracking };