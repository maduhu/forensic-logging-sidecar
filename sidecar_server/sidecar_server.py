#!/usr/bin/env python

from socket import *
from datetime import datetime
import os
import sys

SIZE_OF_BUFFER = 5

Host=""
Port=5678
serverSocket = socket(AF_INET, SOCK_STREAM)
serverSocket.bind((Host,Port))
serverSocket.listen(1)
print ('now the server is on')

class RingBuffer:
    def __init__(self,size_max):
        self.max = size_max
        self.data = []

    class __Full:
        def append(self, x):
            self.data[self.cur] = x
            self.cur = (self.cur+1) % self.max
        def get(self):
            return self.data[self.cur:]+self.data[:self.cur]

    def append(self,x):
        self.data.append(x)
        if len(self.data) == self.max:
            self.cur = 0
            self.__class__ = self.__Full

    def get(self):
        return self.data

def write_to_file(file_name, content):
	file_name = open(file_name, 'w')
	file_name.write(content)
	file_name.close()

if __name__ == '__main__':
	ring_buffer = RingBuffer(SIZE_OF_BUFFER)
	while True:
		print ('Ready to serve...')
		connectionSocket, addr = serverSocket.accept()
		print ('Got connection from', addr)

		file_name = str(datetime.now())
		try:
			message = connectionSocket.recv(1024)
			print 'Got message: ' + message
			if len(ring_buffer.get()) == SIZE_OF_BUFFER:
				os.remove(ring_buffer.get()[0])
			write_to_file(file_name, message)
			ring_buffer.append(file_name)

			return_buffer = ''
			for x in ring_buffer.get():
				return_buffer = return_buffer + x + '\n'
			print return_buffer
			connectionSocket.close()
                        sys.stdout.flush()
		except IOError:
			print ('ERROR')
			connectionSocket.close()
                        sys.stdout.flush()
		except IOError:
			print ('ERROR')
			connectionSocket.close()
	serverSocket.close()
