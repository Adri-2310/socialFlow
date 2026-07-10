#!/bin/bash
cd apps/web
printf "y\n0\n" | pnpm dlx shadcn@latest add https://tweakcn.com/r/themes/cmnfqba56000104la8fufb2f1 --yes
echo "✅ Thème tweakcn ajouté avec succès!"
