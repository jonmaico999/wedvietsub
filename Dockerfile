STREAMING_CHUNK: Khởi tạo môi trường Node.js

FROM node:18-slim

STREAMING_CHUNK: Cài đặt FFmpeg để xử lý Video trên Server Render

(Đã sửa lỗi thêm dấu # ở đầu dòng này để tránh Docker parse error)

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

STREAMING_CHUNK: Thiết lập thư mục làm việc

WORKDIR /app

STREAMING_CHUNK: Copy file cấu hình và cài đặt thư viện

COPY package*.json ./
RUN npm install

STREAMING_CHUNK: Copy toàn bộ code vào Server

COPY . .

STREAMING_CHUNK: Mở cổng 3000 và chạy lệnh khởi động

EXPOSE 3000

CMD ["node", "server.js"]
