<template>
  <div class="dashboard">
    <h2>仪表盘</h2>
    <el-row :gutter="20">
      <el-col :span="6" v-for="card in cards" :key="card.label">
        <el-card shadow="hover"><div class="stat-card"><div class="stat-label">{{ card.label }}</div><div class="stat-value">{{ card.value }}</div></div></el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20" style="margin-top:20px">
      <el-col :span="12"><el-card><template #header>今日概览</template><div class="ph">📊 今日流水趋势图（待集成图表库）</div></el-card></el-col>
      <el-col :span="12"><el-card><template #header>赛事概览</template><div class="ph">📋 赛事下注排行（待集成图表库）</div></el-card></el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getDashboardStats } from '@/api'

const cards = ref([
  { label: '今日总流水', value: '¥ 0.00' },
  { label: '今日订单数', value: '0' },
  { label: '进行中赛事', value: '0' },
  { label: '今日盈亏', value: '¥ 0.00' }
])

onMounted(async () => {
  try {
    const res = await getDashboardStats()
    const d = res.data
    cards.value = [
      { label: '今日总流水', value: '¥ ' + (d.todayTotal||0).toFixed(2) },
      { label: '今日订单数', value: String(d.todayCount||0) },
      { label: '进行中赛事', value: String(d.liveMatches||0) },
      { label: '今日盈亏', value: '¥ ' + ((d.todayProfit||0).toFixed(2)) }
    ]
  } catch (e) { console.error(e) }
})
</script>

<style lang="scss" scoped>
.dashboard h2 { margin-bottom: 20px; }
.stat-card { text-align:center; .stat-label{font-size:14px;color:#909399;margin-bottom:10px} .stat-value{font-size:28px;font-weight:bold;color:#303133} }
.ph { height:250px;display:flex;align-items:center;justify-content:center;background:#fafafa;border-radius:8px;color:#909399 }
</style>
