"""
Utilities - Logging and Common Helper Functions

Provides logging infrastructure and utility functions used throughout the system.

TODO: Add more utility functions as needed
"""

import logging
from pathlib import Path
from datetime import datetime


def setup_logger(name: str, log_file: str = "backend/logs/drone_system.log") -> logging.Logger:
    """
    Set up a logger with file and console output.
    
    Args:
        name: Logger name
        log_file: Path to log file
        
    Returns:
        Configured logger instance
        
    TODO: Add log rotation
    TODO: Add structured logging (JSON format)
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    
    # Create logs directory if needed
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    
    # File handler
    fh = logging.FileHandler(log_file)
    fh.setLevel(logging.DEBUG)
    
    # Console handler
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    
    # Formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    fh.setFormatter(formatter)
    ch.setFormatter(formatter)
    
    logger.addHandler(fh)
    logger.addHandler(ch)
    
    return logger


# Global logger instance
logger = setup_logger("drone_system")


def log_event(event: str, level: str = "INFO"):
    """
    Log an event to the system logger.
    
    Args:
        event: Event description
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    if level == "DEBUG":
        logger.debug(event)
    elif level == "INFO":
        logger.info(event)
    elif level == "WARNING":
        logger.warning(event)
    elif level == "ERROR":
        logger.error(event)
    elif level == "CRITICAL":
        logger.critical(event)
