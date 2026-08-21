<template>
  <div class="match-plays">
    <div class="page-header">
      <h2 class="plays-title">
        赛事玩法 -
        <template v-if="matchInfo">
          <span v-if="matchInfo.ccId">{{ matchInfo.ccId }} </span>
          <span class="team-cell">
            <img v-if="matchInfo.teamAFlag" :src="matchInfo.teamAFlag" class="team-flag" alt="" referrerpolicy="no-referrer" />
            <span>{{ matchInfo.teamA }}</span>
          </span>
          <span class="vs">vs</span>
          <span class="team-cell">
            <img v-if="matchInfo.teamBFlag" :src="matchInfo.teamBFlag" class="team-flag" alt="" referrerpolicy="no-referrer" />
            <span>{{ matchInfo.teamB }}</span>
          </span>
        </template>
        <template v-else>{{ matchName }}</template>
      </h2>
      <el-button icon="Refresh" @click="loadList">刷新</el-button>
    </div>

    <el-alert
      v-if="matchInfo?.sourceMatchId"
      type="info"
      :closable="false"
      style="margin-bottom:16px"
      title="玩法由接口自动同步（每分钟），可人工覆盖赔率/停售；覆盖后点击「恢复跟随」回到接口赔率"
    />

    <el-card>
      <el-table :data="list" border stripe v-loading="loading" row-key="_id">
        <el-table-column label="分类" width="160">
          <template #default="{row}">{{ row.categoryPath || row.categoryName }}</template>
        </el-table-column>
        <el-table-column prop="name" label="玩法名称" width="110" />
        <el-table-column label="盘口/水位" width="180">
          <template #default="{row}">
            <span v-if="row.handicap !== undefined && row.handicap !== null">{{ pankouText(row) }}　{{ row.water }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="原始赔率(接口)" width="120">
          <template #default="{row}">
            <span v-if="row.oddsSource !== undefined && row.oddsSource !== null">{{ row.oddsSource }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="展示赔率" width="170">
          <template #default="{row}">
            <el-input-number
              v-model="row.odds"
              :min="1.01"
              :precision="2"
              :step="0.01"
              size="small"
              controls-position="right"
              style="width:130px"
              @change="(v)=>updateOdds(row,v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="停售" width="80">
          <template #default="{row}">
            <el-switch v-model="row.stop" @change="(v)=>toggleStop(row,v)" />
          </template>
        </el-table-column>
        <el-table-column label="结算结果" width="100">
          <template #default="{row}">
            <el-tag v-if="row.result" :type="resultType(row.result)" size="small">{{ resultText(row.result) }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="人工覆盖" width="90">
          <template #default="{row}">
            <el-tag v-if="row.manualOdds || row.manualStop" type="warning" size="small">已覆盖</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{row}">
            <el-button v-if="row.manualOdds || row.manualStop" size="small" @click="doFollow(row)">恢复跟随</el-button>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getMatchList, getPlayList, updatePlay, followPlay, stopPlay } from '@/api'

const route = useRoute()
const matchId = route.params.id
const matchName = ref('')
const matchInfo = ref(null)
const loading = ref(false)
const list = ref([])

const loadList = async () => {
  loading.value = true
  try {
    const res = await getPlayList({ matchId, pageSize: 500 })
    list.value = res.data.list || []
  } catch (e) { console.error(e) }
  loading.value = false
}
const loadMatch = async () => {
  const res = await getMatchList({ pageSize: 500 })
  const m = (res.data.list || []).find(m => m._id === matchId)
  if (m) {
    matchInfo.value = m
    matchName.value = (m.ccId ? m.ccId + ' ' : '') + (m.teamA || '') + ' vs ' + (m.teamB || '')
  }
}
onMounted(() => { loadMatch(); loadList() })

const updateOdds = async (row, val) => {
  try {
    await updatePlay(row._id, { odds: val, _oldOdds: row.odds })
    row.manualOdds = true
    ElMessage.success('赔率已覆盖（同步不再覆盖此玩法）')
  } catch (e) { ElMessage.error(e.message || '失败'); loadList() }
}

const toggleStop = async (row, val) => {
  try {
    await stopPlay(row._id, val)
    row.manualStop = true
    ElMessage.success(val ? '已停售（同步不再覆盖）' : '已恢复销售')
  } catch (e) { ElMessage.error(e.message || '失败'); loadList() }
}

const doFollow = async (row) => {
  try {
    await followPlay(row._id)
    ElMessage.success('已恢复跟随接口赔率')
    loadList()
  } catch (e) { ElMessage.error(e.message || '失败') }
}

const resultText = (r) => ({ win: '中', half_win: '半赢', push: '走盘', half_lose: '半输', lose: '未中' }[r] || r)
const resultType = (r) => ({ win: 'success', half_win: 'success', push: 'info', half_lose: 'warning', lose: 'danger' }[r] || 'info')

// 盘口数值 -> 中文(与移动端 detail.vue 保持一致)
const pankouText = (row) => {
  const n = row.handicap
  const v = Math.abs(n)
  const map = [
    [0, '平手'], [0.25, '平手/半球'], [0.5, '半球'], [0.75, '半球/一球'],
    [1, '一球'], [1.25, '一球/一球半'], [1.5, '一球半'], [1.75, '一球半/二球'],
    [2, '二球'], [2.25, '二球/二球半'], [2.5, '二球半'], [2.75, '二球半/三球'],
    [3, '三球'], [3.25, '三球/三球半'], [3.5, '三球半'], [3.75, '三球半/四球'],
    [4, '四球'], [4.25, '四球/四球半'], [4.5, '四球半'], [4.75, '四球半/五球'], [5, '五球']
  ]
  let text = ''
  for (const [k, t] of map) {
    if (Math.abs(v - k) < 0.001) { text = t; break }
  }
  if (!text) text = String(v)
  const isAsia = row.side === 'home' || row.side === 'away'
  if (!isAsia) return text // 大小球: 直接显示"二球半"
  if (n === 0) return '平手'
  return n < 0 ? ('让' + text) : ('受让' + text)
}
</script>

<style lang="scss" scoped>
.match-plays .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; h2 { margin:0; } }
.plays-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.team-cell { display:inline-flex; align-items:center; gap:6px; }
.team-flag { width:26px; height:20px; object-fit:contain; background:#f5f5f5; border-radius:2px; vertical-align:middle; }
.vs { color:#d32f2f; font-size:16px; }
</style>
