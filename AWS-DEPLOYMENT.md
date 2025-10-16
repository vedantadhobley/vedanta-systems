# AWS Deployment Guide for Vedanta Systems Frontend

This guide walks you through deploying the frontend to AWS.

## Architecture Overview

```
vedanta.systems (Route 53 Domain)
         ↓
   CloudFront CDN (Optional but recommended)
         ↓
   Application Load Balancer (ALB)
         ↓
   ECS/EC2 Container Running Frontend
```

## Prerequisites

- AWS Account
- AWS CLI installed and configured
- Docker installed locally
- Domain: `vedanta.systems` registered and configured in Route 53

## Step 1: Set Up ECR (Elastic Container Registry)

ECR is AWS's container image registry, like Docker Hub but for AWS.

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name vedanta-systems-frontend \
  --region us-east-1

# Get your AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo $AWS_ACCOUNT_ID
```

## Step 2: Build and Push Docker Image to ECR

```bash
# Get authentication token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# Build image locally
docker build -t vedanta-systems-frontend:latest .

# Tag for ECR
docker tag vedanta-systems-frontend:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest

# Push to ECR
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest
```

## Step 3: Choose Deployment Option

### Option A: Deploy to ECS (Recommended for easier management)

#### Create ECS Cluster

```bash
# Create cluster
aws ecs create-cluster --cluster-name vedanta-systems-frontend

# Create task definition
cat > task-definition.json << 'EOF'
{
  "family": "vedanta-systems-frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "frontend",
      "image": "${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/vedanta-systems-frontend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

# Replace AWS_ACCOUNT_ID in the file
sed -i "s/\${AWS_ACCOUNT_ID}/${AWS_ACCOUNT_ID}/g" task-definition.json

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json

# Create CloudWatch Log Group
aws logs create-log-group \
  --log-group-name /ecs/vedanta-systems-frontend \
  --region us-east-1 || true
```

#### Create Service

```bash
# Get VPC and Subnet details
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' \
  --output text)

SUBNET=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query 'Subnets[0].SubnetId' \
  --output text)

# Create Security Group
SECURITY_GROUP=$(aws ec2 create-security-group \
  --group-name vedanta-systems-frontend-sg \
  --description "Frontend security group" \
  --vpc-id ${VPC_ID} \
  --query 'GroupId' \
  --output text)

# Allow traffic on port 3000
aws ec2 authorize-security-group-ingress \
  --group-id ${SECURITY_GROUP} \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0

# Create service
aws ecs create-service \
  --cluster vedanta-systems-frontend \
  --service-name vedanta-systems-frontend \
  --task-definition vedanta-systems-frontend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET}],securityGroups=[${SECURITY_GROUP}],assignPublicIp=ENABLED}" \
  --region us-east-1
```

### Option B: Deploy to EC2

```bash
# Launch EC2 instance (t3.micro for small projects)
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.micro \
  --key-name your-key-pair \
  --security-groups default

# SSH into instance and run:
# sudo yum update -y
# sudo yum install docker -y
# sudo systemctl start docker
# sudo docker pull ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest
# sudo docker run -d -p 3000:3000 ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest
```

## Step 4: Set Up Application Load Balancer (ALB)

```bash
# Create target group
aws elbv2 create-target-group \
  --name vedanta-systems-frontend \
  --protocol HTTP \
  --port 3000 \
  --vpc-id ${VPC_ID} \
  --target-type ip

# Note the TargetGroupArn from output

# Create load balancer
aws elbv2 create-load-balancer \
  --name vedanta-systems-frontend-alb \
  --subnets ${SUBNET} \
  --security-groups ${SECURITY_GROUP} \
  --scheme internet-facing

# Note the LoadBalancerArn from output

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn <ALB_ARN> \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=<TARGET_GROUP_ARN>
```

## Step 5: Set Up Route 53 DNS

```bash
# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names vedanta-systems-frontend-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

# Get hosted zone ID for vedanta.systems
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --query "HostedZones[?Name=='vedanta.systems.'].Id" \
  --output text | cut -d'/' -f3)

# Create alias record
cat > route53-change.json << EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "vedanta.systems",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z35SXDOTRQ7X7K",
          "DNSName": "${ALB_DNS}",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id ${ZONE_ID} \
  --change-batch file://route53-change.json
```

## Step 6 (Optional): Set Up CloudFront CDN

```bash
# Create CloudFront distribution pointing to ALB
# Use AWS Console for easier configuration:
# CloudFront → Create Distribution → Origin: ALB DNS → Use vedanta.systems as CNAME
```

## Step 7: Set Up HTTPS (Recommended)

```bash
# Request SSL certificate in ACM
aws acm request-certificate \
  --domain-name vedanta.systems \
  --validation-method DNS \
  --region us-east-1
```

Then:
1. Go to ACM Console → Pending Certificates → vedanta.systems
2. Click "Create records in Route 53"
3. Wait for validation (5-10 minutes)
4. Update ALB listener to use HTTPS

## Monitoring and Logs

```bash
# View logs
aws logs tail /ecs/vedanta-systems-frontend --follow

# Check ECS service status
aws ecs describe-services \
  --cluster vedanta-systems-frontend \
  --services vedanta-systems-frontend
```

## Environment Variables on AWS

Update environment variables in your ECS task definition or EC2 user data:

```bash
# Example for ECS, in task-definition.json
"environment": [
  {
    "name": "VITE_API_BASE_URL",
    "value": "https://api.your-backend-service.com"
  },
  {
    "name": "VITE_ENVIRONMENT",
    "value": "production"
  }
]
```

## Updating the Deployment

```bash
# After code changes:
# 1. Build new image
docker build -t vedanta-systems-frontend:latest .

# 2. Tag and push
docker tag vedanta-systems-frontend:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/vedanta-systems-frontend:latest

# 3. Update service (ECS will pull new image)
aws ecs update-service \
  --cluster vedanta-systems-frontend \
  --service vedanta-systems-frontend \
  --force-new-deployment
```

## Troubleshooting

- **Container won't start:** Check CloudWatch Logs
- **Domain not resolving:** Wait for Route 53 propagation (5-10 minutes)
- **High costs:** Consider using ECS Fargate Spot instances or t3.nano EC2 instances
- **Performance issues:** Enable CloudFront caching and optimize images

## Cost Estimation (Monthly)

- ECS Fargate: ~$8-15
- ALB: ~$15
- Route 53: ~$0.50
- **Total: ~$25-30/month** (very affordable!)

## Next Steps

1. ✅ Docker image pushed to ECR
2. ⬜ ECS/EC2 service deployed
3. ⬜ ALB configured
4. ⬜ DNS records updated
5. ⬜ HTTPS certificate activated
6. ⬜ Monitor and scale as needed

Let me know if you need help with any of these steps!
