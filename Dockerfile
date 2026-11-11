FROM denoland/deno:alpine-2.3.3

EXPOSE 2405

WORKDIR /app

# Prefer not to run as root.
USER deno

# Cache the dependencies as a layer (re-run only when deps.ts changes).
COPY deps.ts deno.json ./
RUN deno cache --allow-import deps.ts

ADD . .
RUN deno cache --allow-import main.ts

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-import", "main.ts"]
