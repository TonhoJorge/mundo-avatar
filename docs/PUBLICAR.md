# Publicar na sua VM, passo a passo

Este guia supõe uma VM Linux (Ubuntu ou Debian) que você acessa por SSH. O site roda num **container Docker isolado**: uma "caixinha" só dele, com rede própria, sem acesso de administrador e com limite de CPU e memória. Ele não interfere no resto da VM.

## 1. Instalar o Docker (uma vez só)

Na VM:

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker $USER
```

Saia da VM e entre de novo para a permissão valer. Para conferir:

```bash
docker compose version
```

## 2. Levar o projeto para a VM

**Opção A (recomendada): GitHub**

```bash
git clone https://github.com/TonhoJorge/mundo-avatar.git ~/mundo-avatar
```

**Opção B: arquivo compactado (`mundo-avatar.tar.gz`)**

1. No seu computador, copie o arquivo para a VM, trocando `usuario` e `IP-DA-VM`:

   ```bash
   scp mundo-avatar.tar.gz usuario@IP-DA-VM:~
   ```

2. Na VM:

   ```bash
   mkdir -p ~/mundo-avatar && tar -xzf ~/mundo-avatar.tar.gz -C ~/mundo-avatar
   ```

## 3. Subir o site

```bash
cd ~/mundo-avatar && docker compose up -d --build
```

O primeiro build gera o mapa inteiro e pode levar de **15 a 40 minutos**, dependendo da CPU. Os próximos builds são rápidos, a não ser que você mude a geografia, os lugares ou a arte.

Para acompanhar:

```bash
docker compose logs -f
```

Para ver se está no ar (deve aparecer `healthy`):

```bash
docker compose ps
```

## 4. Liberar a porta e acessar

- Se a VM está na nuvem (Oracle, AWS, Google, Azure…), libere a porta **8080/TCP** nas regras de firewall do painel do provedor.
- Se usa o firewall `ufw` na VM:

  ```bash
  sudo ufw allow 8080/tcp
  ```

Depois abra `http://IP-DA-VM:8080` no navegador.

Para usar outra porta, crie o arquivo `.env` na pasta do projeto com `MUNDO_AVATAR_PORTA=8090` e rode `docker compose up -d` de novo.

## 5. Domínio e HTTPS (opcional)

Com um domínio apontando para a VM, o jeito mais simples é o [Caddy](https://caddyserver.com), que cuida do certificado sozinho. Exemplo de `Caddyfile`:

```
mapa.seudominio.com {
    reverse_proxy 127.0.0.1:8080
}
```

Nesse caso, mantenha a porta 8080 fechada para a internet e abra só a 80 e a 443.

## 6. Atualizar

- **Opção A (GitHub):**

  ```bash
  cd ~/mundo-avatar && ./deploy/atualizar.sh
  ```
- **Opção B:** extraia o arquivo novo por cima da pasta e rode `docker compose up -d --build`.

## Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| `permission denied` ao usar `docker` | Faltou sair e entrar de novo na VM após o passo 1. |
| A página não abre | Confira o firewall (passo 4) e `docker compose ps`. |
| O build falhou por memória | Use `MAX_ZOOM=5` no `.env` (mapa um pouco menos detalhado, build bem mais leve). |
| Quero parar o site | `docker compose down`, na pasta do projeto. |
