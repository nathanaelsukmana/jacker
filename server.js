// server.js (Pembaruan LinkedIn - Auto URL Converter)
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/api/scrape', async (req, res) => {
    let { url } = req.body; // Kita ubah jadi 'let' agar URL bisa kita modifikasi
    let browser;

    try {
        // --- TRIK KHUSUS LINKEDIN ---
        // Jika link mengandung currentJobId, ubah jadi link publik
        if (url.includes('linkedin.com') && url.includes('currentJobId=')) {
            try {
                const urlObj = new URL(url);
                const jobId = urlObj.searchParams.get('currentJobId');
                if (jobId) {
                    url = `https://www.linkedin.com/jobs/view/${jobId}`;
                    console.log(`[LinkedIn] Mengubah ke link publik: ${url}`);
                }
            } catch (e) {
                console.log("Gagal memodifikasi URL LinkedIn");
            }
        }

        console.log(`Sedang memproses link: ${url}`);
        
        // Kita tambahkan argumen khusus untuk mengecoh LinkedIn agar lebih mirip manusia
        browser = await puppeteer.launch({ 
          headless: true,
         args: [
             '--no-sandbox', 
             '--disable-setuid-sandbox', 
             '--disable-blink-features=AutomationControlled',
             '--disable-dev-shm-usage', // Penting untuk server cloud agar tidak kehabisan memori
             '--disable-gpu'            // Menghemat beban grafis
         ]
        });
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Tunggu 3 detik ekstra

        const pageData = await page.evaluate(() => {
            let extractedTitle = '';
            let extractedCompany = '';
            const urlStr = window.location.hostname;

            if (urlStr.includes('indeed')) {
                const titleEl = document.querySelector('h2[data-testid="jobsearch-JobInfoHeader-title"]');
                if (titleEl) {
                    let rawText = titleEl.innerText;
                    extractedTitle = rawText.split(/- job post/i)[0].replace(/[\r\n]+/g, '').trim();
                } else {
                    const fallbackH1 = document.querySelector('h1');
                    if (fallbackH1) extractedTitle = fallbackH1.innerText.trim();
                }
                
                const compEl = document.querySelector('[data-testid="inlineHeader-companyName"]') || document.querySelector('[data-company-name="true"]');
                if (compEl) extractedCompany = compEl.innerText.trim();
            } 
            else if (urlStr.includes('linkedin')) {
                // Tampilan Publik LinkedIn
                const titleEl = document.querySelector('h1.top-card-layout__title') || document.querySelector('h1');
                if (titleEl) extractedTitle = titleEl.innerText.trim();
                
                const compEl = document.querySelector('a.topcard__org-name-link') || 
                               document.querySelector('span.topcard__flavor') || 
                               document.querySelector('.topcard__org-name-link');
                if (compEl) extractedCompany = compEl.innerText.trim();
            }

            return { extractedTitle, extractedCompany };
        });

        let jobTitle = pageData.extractedTitle;
        let company = pageData.extractedCompany;

        // Jika halamannya ternyata masih tertahan di "Sign In"
        if (jobTitle.toLowerCase().includes('sign in') || jobTitle.toLowerCase().includes('login')) {
            jobTitle = ""; // Kosongkan agar masuk ke mode cadangan
        }

        // --- CADANGAN ---
        if (!jobTitle) {
            console.log("Gagal membaca judul spesifik, pakai judul Tab.");
            const pageTitle = await page.title();
            
            // Periksa jika yang tertangkap adalah tab Sign In LinkedIn
            if (pageTitle.toLowerCase().includes('sign in') || pageTitle.toLowerCase().includes('login')) {
                jobTitle = "Terhalang Login LinkedIn (Input Manual)";
                company = "Input Manual";
            } else {
                jobTitle = pageTitle;
                if (!company) company = "Tidak Ditemukan";
            }
        }

        console.log(`Berhasil! Pekerjaan: [${jobTitle}], Perusahaan: [${company}]`);
        
        await browser.close();
        res.json({ jobTitle, company });

    } catch (error) {
        console.error("Error scraping:", error.message);
        if (browser) await browser.close();
        res.status(500).json({ error: "Gagal mengambil data dari URL." });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});