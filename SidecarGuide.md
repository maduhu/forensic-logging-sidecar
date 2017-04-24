# Sidecar Guide
***

## Introduction
In this guide, we'll walk through the different steps of transmitting messages from sidecar client to sidecar server.
* [**Building the docker image**](#building-the-docker-image)
* [**Creating a subnet**](#creating-a-subnet)
* [**Running sidecar server and client in the subnet**](#running-sidecar-server-and-client-in-the-subnet)

***

## Building the docker image
To get started, you will need to build the docker images for both sidecar client and server.

### Build sidecar server docker image
First you need to Run
```
docker build .
```
You will get the following result
```
Successfully built aa7068c141e8
```

### Build sidecar client image
Run the same command and you can get the similar result:
```
Successfully built 5bcc654b5088
```

## Creating a subnet
You will need to create a subnet in docker to be used for both client and server.
```
docker network create --subnet=172.18.0.0/29 sidecar_net
```
Set the name of the subnet to **sidecar_net**, the IP range that can be used is 172.18.0.0/29.

## Running sidecar server and client in the subnet
Now that you have the subnet created within docker, you need to run the docker images we built in [Step 1](#building-the-docker-image) in the subnet we created in [Step 2.](#creating-a-subnet)

### Run sidecar server in the subnet
```
docker run --net sidecar_net -d --name sidecar_server --ip 172.18.0.2 aa7068c141e8
```
Now you are running sidecar server with ip address 172.18.0.2 in the subnet **sidecar_net**. If you want to change the IP address used for the sidecar_server, you will also need to change the [sidecar_client.sh](sidecar_client/sidecar_client.sh) to make it match the IP address given in the previous command.

### Run sidecar client in the subnet
```
docker run -d --net sidecar_net --name sidecar_client 5bcc654b5088
```
Now you are running sidecar client in the subnet **sidecar_net**.
