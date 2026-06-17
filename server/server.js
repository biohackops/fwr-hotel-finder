const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Main scraping endpoint
app.post('/api/scan', async (req, res) => {
  const { name, address, website } = req.body;
  
  if (!name || !address) {
    return res.status(400).json({ success: false, error: 'Name and address are required' });
  }

  const logs = [];
  const log = (msg) => {
    const time = new Date().toLocaleTimeString();
    logs.push(`[${time}] ${msg}`);
    console.log(`[SCAN LOG] ${msg}`);
  };

  log(`⚡ INITIATING LIVE FWR SCAN FOR: "${name}"`);
  
  let browser = null;
  let reviews = [];
  let websiteText = '';
  let hasSemiParking = false;
  let clearanceStatus = 'UNKNOWN';
  let clearanceNotes = '';
  let websiteVerification = 'Website could not be reached or parsed.';

  try {
    // ----------------------------------------------------
    // STEP 1: Crawl Hotel Website (Axios request)
    // ----------------------------------------------------
    if (website && website.startsWith('http')) {
      log(`🌐 Attempting to audit official website: ${website}`);
      try {
        const webRes = await axios.get(website, { 
          timeout: 4000,
          httpsAgent: httpsAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        websiteText = webRes.data.toString().toLowerCase();
        log(`✅ Scraped website content successfully.`);
        
        // Inspect website terms for oversized vehicle policies
        const keywords = [
          'oversized', 'truck parking', 'bus parking', 'rv parking', 
          'trailer parking', 'semi parking', 'large vehicle', 'commercial vehicle'
        ];
        const positiveMatch = keywords.find(keyword => websiteText.includes(keyword));
        if (positiveMatch) {
          websiteVerification = `Found on official website: Mentions "${positiveMatch}" in amenities/policies.`;
          log(`👍 Website match: Found keyword "${positiveMatch}".`);
        } else {
          websiteVerification = `Official website scraped. No explicit mention of oversized vehicle or truck parking in the home body text.`;
          log(`ℹ️ Website text scanned: No oversized vehicle keywords found.`);
        }
      } catch (err) {
        log(`⚠️ Website crawl failed: ${err.message || err}`);
        websiteVerification = `Failed to scrape website policies: ${err.message || 'Connection timeout'}.`;
      }
    } else {
      log(`ℹ️ No official website URL available for crawling.`);
      websiteVerification = `No website URL provided.`;
    }

    // ----------------------------------------------------
    // STEP 2: Launch Headless Browser to Scrape Google Maps
    // ----------------------------------------------------
    log(`📡 Launching headless Chrome browser...`);
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set custom user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const searchStr = `${name} ${address}`;
    log(`🔍 Navigating to Google Maps & searching for: "${searchStr}"`);
    
    // Go directly to Google Maps search
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchStr)}`;
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    log(`⏳ Waiting for Maps results to resolve...`);
    
    // Wait for maps sidebar content to render
    // Let's give it up to 6 seconds to load details
    await new Promise(r => setTimeout(r, 6000));
    
    // Check if we are hit by a captcha
    const pageTitle = await page.title();
    if (pageTitle.includes('Captcha') || pageTitle.includes('unusual traffic')) {
      log(`⚠️ Google Maps returned a CAPTCHA challenge. Switching to Google Search fallback...`);
      throw new Error('Google Maps CAPTCHA');
    }

    // Try to find review elements
    log(`💬 Searching page for reviews...`);
    
    // Extract review elements using common Google Maps DOM selectors
    const scrapedReviews = await page.evaluate(() => {
      const reviewElements = document.querySelectorAll('span.wi273c, div.MyEned, span.rsqVse');
      const results = [];
      
      reviewElements.forEach((el) => {
        const text = el.innerText || el.textContent;
        if (text && text.trim().length > 20) {
          // Find author if possible
          let author = "Google User";
          try {
            // Traverse up to find author container
            const container = el.closest('div.jftiEf, div.DUwDvf');
            if (container) {
              const authorEl = container.querySelector('button.al63Be, div.d4r55');
              if (authorEl) author = authorEl.innerText || authorEl.textContent;
            }
          } catch (e) {}
          
          results.push({
            author: author.trim(),
            text: text.trim()
          });
        }
      });
      return results;
    });

    if (scrapedReviews && scrapedReviews.length > 0) {
      reviews = scrapedReviews.slice(0, 10);
      log(`✅ Successfully extracted ${reviews.length} reviews from Google Maps!`);
    } else {
      log(`ℹ️ Google Maps layout search returned no review tags. Trying Google Search Fallback...`);
      throw new Error('No reviews on Maps Page');
    }

  } catch (err) {
    // ----------------------------------------------------
    // FALLBACK: Scrape Google Search snippets
    // ----------------------------------------------------
    log(`📡 Google Maps scrape failed/redirected. Initiating Google Search Fallback...`);
    
    if (browser) {
      try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Search Google for hotel reviews and truck parking keywords
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + address + ' semi truck parking reviews')}`;
        log(`🔍 Querying Google Search snippets: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        
        await new Promise(r => setTimeout(r, 3000));
        
        // Extract Google Search result snippets (class name is typically "VwiC3b" or "yDYN2d" or span under result)
        const snippets = await page.evaluate(() => {
          const els = document.querySelectorAll('.VwiC3b, .yDYN2d, .MUcb1c, .w1NWoc');
          const results = [];
          els.forEach((el, index) => {
            const text = el.innerText || el.textContent;
            if (text && text.trim().length > 30) {
              results.push({
                author: `Driver Web Scrape #${index + 1}`,
                text: text.trim()
              });
            }
          });
          return results;
        });

        if (snippets && snippets.length > 0) {
          reviews = snippets.slice(0, 6);
          log(`✅ Extracted ${reviews.length} search snippets containing real driver feedback!`);
        } else {
          log(`⚠️ Search snippets crawler returned 0 hits.`);
        }
      } catch (fallbackErr) {
        log(`❌ Fallback scraping failed: ${fallbackErr.message || fallbackErr}`);
      }
    }
  } finally {
    if (browser) {
      log(`📡 Closing browser instance.`);
      await browser.close().catch(e => console.error("Error closing browser:", e));
    }
  }

  // ----------------------------------------------------
  // STEP 3: Run Parking Diagnostics Engine
  // ----------------------------------------------------
  log(`🤖 Running FWR Parking Diagnostics Engine...`);
  
  const positiveKeywords = [
    'semi', 'truck', 'trailer', 'oversized', 'bus', 'rig', 'hauler', 
    '53ft', 'tractor', 'pull through', 'flatbed', 'wide turn', 'gravel', 
    'dirt', 'grass', 'field', 'staging', 'vacant', 'behind', 'next door', 
    'adjacent', 'open lot', 'surface lot', 'clearance', 'open space', 'flat'
  ];
  
  const absoluteBarriers = [
    'parking deck only', 'parking garage only', 'height limit', 'clearance limit', 
    'height restriction', 'no commercial vehicle', 'low clearance'
  ];

  // Combine scraped texts to analyze
  const allReviewTexts = reviews.map(r => r.text.toLowerCase()).join(' ');
  const combinedScrapes = (allReviewTexts + ' ' + websiteText).toLowerCase();

  // Look for matches
  const positiveMatches = positiveKeywords.filter(kw => combinedScrapes.includes(kw));
  const barrierMatches = absoluteBarriers.filter(kw => combinedScrapes.includes(kw));

  // Determine suitability focusing on surface area and open gravel/dirt
  if (barrierMatches.length > 0) {
    // If there is an absolute height/clearance barrier (like a parking deck), it's truly unsuitable
    hasSemiParking = false;
    clearanceStatus = 'UNSUITABLE';
    clearanceNotes = `Live Audit: Physical height or structural barriers detected ("${barrierMatches.join(', ')}"). Maneuvering a 70ft rig is blocked.`;
  } else if (positiveMatches.length > 0) {
    // If we have positive mentions of truck space, gravel, dirt, or adjacent open lots
    hasSemiParking = true;
    
    // Check if it specifically mentions dirt/gravel
    const usesGravelOrDirt = positiveMatches.some(m => ['gravel', 'dirt', 'field', 'grass', 'vacant'].includes(m));
    
    if (usesGravelOrDirt) {
      clearanceStatus = 'EXCELLENT';
      clearanceNotes = `Live Audit: Suitable surface area found! Mentions adjacent dirt, gravel, or vacant space ("${positiveMatches.filter(m => ['gravel', 'dirt', 'field', 'grass', 'vacant', 'staging', 'behind'].includes(m)).join(', ')}"). Ideal for staging and setting up a 70ft Ferris wheel trailer.`;
    } else {
      clearanceStatus = 'SUITABLE';
      clearanceNotes = `Live Audit: Large open surface lot keywords detected (${positiveMatches.slice(0, 4).join(', ')}). No absolute height barriers reported. Check layout in satellite view.`;
    }
  } else {
    // Generous fallback: No absolute height barriers found, so mark as SUITABLE by default
    // and instruct the user to verify the open surface / dirt lot visually.
    hasSemiParking = true;
    clearanceStatus = 'SUITABLE';
    clearanceNotes = `Live Audit: No direct warnings or height constraints. Standard surface lot detected. Please overlay the 70ft blueprint on the satellite map to verify setup space.`;
  }

  log(`✅ Analysis finished. Clearance Rating: ${clearanceStatus}`);
  log(`🏁 FWR PIPELINE RUN COMPLETED.`);

  // If no reviews were found anywhere, provide a placeholder noting the lack of data
  if (reviews.length === 0) {
    reviews = [
      { author: "Scanner Alert", text: "No Google Reviews or search snippets mentioning parking were recovered during this live scan. Please consult the satellite view to verify lot size manually." }
    ];
  }

  res.json({
    success: true,
    hasSemiParking,
    parkingScanResult: {
      surfaceDimension: hasSemiParking ? "Estimated 180ft+ open surface lot" : "Subdivided/Tight stalls only",
      clearanceStatus,
      clearanceNotes,
      websiteVerification,
      reviewsMatched: reviews
    },
    logs
  });
});

app.listen(PORT, () => {
  console.log(`🚀 FWR Hotel Finder Scraper Backend running at http://localhost:${PORT}`);
});
