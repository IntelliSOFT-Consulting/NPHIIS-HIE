FROM node:22-alpine

RUN apk update && \
    apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    python3-dev

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY . .

RUN yarn install

RUN yarn build


# RUN npx prisma migrate deploy
# RUN npx prisma generate

RUN . /app/venv/bin/activate && \
    pip3 install --no-cache-dir -r requirements.txt

RUN apk del build-base python3-dev

ENV VIRTUAL_ENV=/app/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"


CMD ["sh", "-c", "npx prisma migrate deploy && yarn serve"]