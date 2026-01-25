#!/bin/bash
# tools/print_ip.sh
# 
# IP Address Display Script
# 
# Prints Raspberry Pi IP addresses and suggested URLs for accessing the server

echo "=========================================="
echo "Raspberry Pi Network Information"
echo "=========================================="
echo ""

# Get IP addresses using hostname -I
if command -v hostname &> /dev/null; then
    IP_ADDRESSES=$(hostname -I 2>/dev/null || echo "")
    if [ -n "$IP_ADDRESSES" ]; then
        echo "IP Addresses:"
        echo "$IP_ADDRESSES" | tr ' ' '\n' | sed 's/^/  /'
        echo ""
        echo "Suggested URLs:"
        echo "$IP_ADDRESSES" | tr ' ' '\n' | while read ip; do
            if [ -n "$ip" ]; then
                echo "  http://$ip:8000"
            fi
        done
    else
        echo "Could not determine IP addresses"
    fi
else
    echo "hostname command not available"
fi

echo ""
echo "Local access:"
echo "  http://localhost:8000"
echo "  http://127.0.0.1:8000"
echo ""

# Try to get hostname
if command -v hostname &> /dev/null; then
    HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
    echo "Hostname: $HOSTNAME"
    echo ""
fi

echo "=========================================="

