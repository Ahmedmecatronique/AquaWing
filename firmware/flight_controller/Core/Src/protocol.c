/* protocol.c — Frame builder + CRC8 */
#include "protocol.h"
#include <string.h>

uint8_t proto_crc8(const uint8_t *data, uint8_t len)
{
    uint8_t crc = 0;
    for (uint8_t i = 0; i < len; i++)
        crc ^= data[i];
    return crc;
}

/* Build a complete frame into buf (caller must ensure buf is large enough:
   PROTO_HDR + plen + 1 bytes) */
void proto_build(uint8_t *buf, uint8_t cmd,
                 const void *payload, uint8_t plen)
{
    buf[0] = PROTO_SYNC1;
    buf[1] = PROTO_SYNC2;
    buf[2] = cmd;
    buf[3] = plen;
    if (plen && payload)
        memcpy(&buf[4], payload, plen);
    /* CRC over cmd + len + data */
    uint8_t crc = cmd ^ plen;
    const uint8_t *p = (const uint8_t *)payload;
    for (uint8_t i = 0; i < plen; i++) crc ^= p[i];
    buf[4 + plen] = crc;
}
