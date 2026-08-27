const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const googleTTS = require('google-tts-api'); // Thư viện tạo giọng nói AI miễn phí

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

let clients = [];

app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    clients.push(res);
    req.on('close', () => { clients = clients.filter(client => client !== res); });
});

function sendLog(percent, stageText, message, type = 'info', downloadUrl = null) {
    const data = JSON.stringify({ percent, stageText, message, type, downloadUrl });
    clients.forEach(client => client.write(`data: ${data}\n\n`));
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// ==========================================
// API LỒNG TIẾNG PHIM (CHẠY THẬT BẰNG FFMPEG)
// ==========================================
app.post('/api/process-dubbing', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Không có video!' });
    
    const inputPath = req.file.path;
    const outputFilename = `dubbed_${req.file.filename}.mp4`; // Ép xuất ra đuôi mp4
    const outputPath = path.join(outputDir, outputFilename);
    const tempAudioPath = path.join(uploadDir, `tts_${Date.now()}.mp3`);
    
    res.json({ message: 'Bắt đầu xử lý lồng tiếng', videoId: req.file.filename });

    try {
        sendLog(10, 'Giai đoạn 1: Phân tích Video', 'STAGE 1: Đang nạp video vào bộ nhớ Render Cloud...', 'system');
        
        // BƯỚC 1: TẠO GIỌNG NÓI AI (GOOGLE TTS)
        sendLog(30, 'Giai đoạn 2: Tạo giọng đọc AI Tiếng Việt', 'STAGE 2: Đang tải kịch bản âm thanh từ API...', 'info');
        const textToSpeak = "Chào mừng bạn. Hệ thống Render của bạn đang thực sự hoạt động. Nó đang render lại video này bằng xê pê u.";
        const url = googleTTS.getAudioUrl(textToSpeak, { lang: 'vi', slow: false, host: 'https://translate.google.com' });
        
        // Tải file mp3 từ Google về server Render
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(tempAudioPath, Buffer.from(buffer));
        
        sendLog(60, 'Giai đoạn 3: Trộn âm thanh & Render Phụ đề', 'STAGE 3: Khởi động FFmpeg. Bắt đầu Render video (quá trình này tốn CPU)...', 'warn');

        // BƯỚC 2: RENDER BẰNG FFMPEG
        // Yêu cầu CPU làm: Ép sub lên video, trộn âm thanh AI với âm thanh gốc
        ffmpeg()
            .input(inputPath) // Video gốc
            .input(tempAudioPath) // File âm thanh AI vừa tạo
            .complexFilter([
                // Mix 2 luồng âm thanh: Giảm volume gốc xuống 0.3, volume AI là 1.5
                '[0:a]volume=0.3[a0];[1:a]volume=1.5[a1];[a0][a1]amix=inputs=2:duration=first[outa]',
                // In chữ phụ đề cứng lên video
                "drawtext=text='AI CineStudio - Da Xu Ly Render Server':fontcolor=yellow:fontsize=30:box=1:boxcolor=black@0.6:boxborderw=5:x=(w-text_w)/2:y=h-th-20[outv]"
            ])
            .outputOptions([
                '-map [outv]', // Lấy luồng hình ảnh đã in chữ
                '-map [outa]', // Lấy luồng âm thanh đã mix
                '-c:v libx264', // Encode lại video bằng chuẩn H.264
                '-preset ultrafast', // Tốc độ render nhanh nhất có thể cho Render free
                '-y' // Ghi đè file nếu đã tồn tại
            ])
            .save(outputPath)
            .on('progress', (progress) => {
                // Hiển thị % render thực tế
                if(progress.percent) {
                    let p = Math.min(Math.round(60 + (progress.percent * 0.35)), 95);
                    sendLog(p, 'Giai đoạn 4: Đang Render...', `Đang encode Frame: ${progress.frames} (FPS: ${progress.currentFps})...`, 'system');
                }
            })
            .on('end', () => {
                // Dọn dẹp rác
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);

                const downloadUrl = `/outputs/${outputFilename}`;
                sendLog(100, 'Hoàn tất!', `Render thành công! Video đã được thêm Sub và Voice AI.`, 'system', downloadUrl);
            })
            .on('error', (err) => {
                console.error(err);
                sendLog(0, 'Lỗi Render', `FFmpeg sập: ${err.message}`, 'error');
            });

    } catch (error) {
        sendLog(0, 'Lỗi Server', `Quá trình thất bại: ${error.message}`, 'error');
    }
});

// ==========================================
// API REVIEW PHIM (Bản mẫu)
// ==========================================
app.post('/api/process-review', upload.single('video'), async (req, res) => {
    // (Làm tương tự logic FFmpeg ở trên nếu muốn chức năng này chạy thật)
    res.json({ error: 'Chức năng này cần cập nhật thêm lệnh FFmpeg tương tự Lồng Tiếng.' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Render đang chạy tại cổng ${PORT}`));
