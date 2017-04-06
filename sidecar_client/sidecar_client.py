from socket import *
import sys
import time

Host=sys.argv[1]
Port=int(sys.argv[2])


start = 0

while(True):
	#try:
	sock = socket(AF_INET, SOCK_STREAM)
	sock.connect((Host,Port))
	send_message = ''
	for x in range(2):
		send_message = send_message + str(start)
		start = start + 1
	print ('send message:', send_message)
	sock.send(send_message)
	sock.close()
	time.sleep(5)
