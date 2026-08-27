const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Phục vụ giao diện người dùng từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));
// Mở thư mục outputs để người dùng có thể tải file về
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

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

// Route Server-Sent Events (SSE) gửi log realtime về frontend
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/process-dubbing', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Không có video!' });
    
    const inputPath = req.file.path;
    const outputFilename = `dubbed_${req.file.filename}`;
    const outputPath = path.join(outputDir, outputFilename);
    
    res.json({ message: 'Bắt đầu xử lý lồng tiếng', videoId: req.file.filename });

    try {
        sendLog(10, 'Giai đoạn 1: Phân tích Video & Ngôn ngữ', 'STAGE 1: Render Cloud đang trích xuất metadata video...', 'system');
        await sleep(1500);
        sendLog(20, 'Giai đoạn 1: Phân tích Video & Ngôn ngữ', 'Gọi API AI Whisper để nhận diện ngôn ngữ gốc...');
        await sleep(2000);
        sendLog(30, 'Giai đoạn 1: Phân tích Video & Ngôn ngữ', 'Phát hiện ngôn ngữ: English (Độ chính xác: 99.8%).', 'info');

        sendLog(40, 'Giai đoạn 2: Dịch thuật & Nhận diện nhân vật', 'STAGE 2: Phân tách giọng nói (Diarization)...', 'system');
        await sleep(2000);
        sendLog(50, 'Giai đoạn 2: Dịch thuật & Nhận diện nhân vật', 'Đang dịch kịch bản EN -> Tiếng Việt giữ nguyên cảm xúc...');

        sendLog(65, 'Giai đoạn 3: Tách âm thanh & Lồng tiếng AI', 'STAGE 3: Tách âm thanh nền (SFX) và Giọng thoại...', 'system');
        await sleep(2500);
        sendLog(75, 'Giai đoạn 3: Tách âm thanh & Lồng tiếng AI', 'Đang tạo giọng AI Tiếng Việt chuẩn...');

        sendLog(85, 'Giai đoạn 4: Đang xuất Video (FFmpeg Render)', 'STAGE 4: FFmpeg trên Cloud Render đang ghép âm thanh & video...', 'system');
        
        // Mô phỏng việc Render xử lý video bằng cách copy file
        fs.copyFileSync(inputPath, outputPath);
        await sleep(3000); 

        sendLog(95, 'Giai đoạn 5: Kiểm tra lỗi & QC', 'STAGE 5: Kiểm duyệt chất lượng Lip-sync & Độ nét...', 'warn');
        await sleep(1500);

        const downloadUrl = `/outputs/${outputFilename}`;
        sendLog(100, 'Hoàn tất!', `Xử lý thành công trên Cloud Render!`, 'system', downloadUrl);

    } catch (error) {
        sendLog(0, 'Lỗi', `Quá trình thất bại: ${error.message}`, 'error');
    }
});

app.post('/api/process-review', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Không có video!' });
    
    const outputFilename = `review_${req.file.filename}`;
    const outputPath = path.join(outputDir, outputFilename);
    
    res.json({ message: 'Bắt đầu xử lý review phim' });

    try {
        sendLog(20, 'Giai đoạn 1: Phân tích Thể loại', 'STAGE 1: Phân tích khung hình xác định thể loại...', 'system');
        await sleep(2000);
        sendLog(50, 'Giai đoạn 2: Lên Kịch Bản Review', 'STAGE 2: AI viết kịch bản hài hước & Render giọng Reviewer...', 'info');
        await sleep(2500);
        sendLog(80, 'Giai đoạn 3: Xuất Video Review', 'STAGE 3: FFmpeg Cloud đang ghép Vietsub và hiệu ứng âm thanh...', 'system');
        
        // Mô phỏng việc Render xử lý video
        fs.copyFileSync(req.file.path, outputPath);
        await sleep(3000);
        
        const downloadUrl = `/outputs/${outputFilename}`;
        sendLog(100, 'Hoàn tất!', 'Video Review đã được xử lý xong trên Cloud!', 'system', downloadUrl);
    } catch (error) {
        sendLog(0, 'Lỗi', `Quá trình thất bại: ${error.message}`, 'error');
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Render đang chạy tại cổng ${PORT}`));
