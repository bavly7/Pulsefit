# 1. استخدام نسخة بايثون 3.12 خفيفة ومستقرة
FROM python:3.12-slim

# 2. تسطيب كل ملفات اللينكس والواجهة اللي المكتبات بتعيط عليها
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libxcb1 \
    libx11-xcb1 \
    libxcb-shape0 \
    libxcb-xfixes0 \
    libxcb-xinerama0 \
    && rm -rf /var/lib/apt/lists/*

# 3. تحديد مسار الشغل
WORKDIR /app

# 4. نسخ ملف المكتبات وتسطيبها
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. الضربة القاضية: مسح النسخة العادية اللي YOLO بينزلها بالعافية، وتأكيد الـ Headless
RUN pip uninstall -y opencv-python || true
RUN pip install --no-cache-dir opencv-python-headless==4.8.1.78

# 6. نسخ باقي ملفات المشروع
COPY . .

# 7. تشغيل السيرفر وربطه بالبورت بتاع Railway
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:$PORT --timeout 120 --workers 1 app:app"]